// src/resolver.js
// gridZERO initia resolver / fulfiller bot.
//
// Responsibilities (mirrors the old Base resolver, minus all ZK):
//   1. Poll gridzero::game::get_current_round() every POLL_INTERVAL_MS.
//   2. When a round's time_remaining == 0 and it is not yet resolved:
//        - total_players  > 0  -> resolve_round(round_id, vrf=32 random bytes)
//        - total_players == 0  -> skip_empty_round(round_id)
//   3. After resolving, read get_round(round_id) to log the winning cell + tx hash.
//   4. Stream events to the frontend over SSE at `<host>/events`:
//        connected      { round }
//        round_resolved { roundId, skipped, winningCell, players, txHash }
//        cell_picked    { roundId, player, cell }     (best-effort, count-diff based)
//        bonus_round    { roundId, winningCell, players, txHash }
//
// No ZK, no zkVerify, no proof generation. Randomness is plain crypto.randomBytes(32);
// the contract derives the winning cell on-chain via keccak256(vrf) % occupied_cells.

import "dotenv/config";
import crypto from "crypto";
import express from "express";
import {
  makeClient,
  makeKey,
  makeWallet,
  getCurrentRound,
  getRound,
  getCellCounts,
  getCellPlayers,
  resolveRound,
  skipEmptyRound,
} from "./initia.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG = {
  moduleAddr: requireEnv("GRIDZERO_ADDR"),
  chainId: process.env.INITIA_CHAIN_ID || "interwoven-1",
  rest: process.env.INITIA_REST || "https://rest.initia.xyz",
  rpc: process.env.INITIA_RPC || "https://rpc.initia.xyz", // not needed for REST flow; kept for parity/env
  gasPrice: process.env.GAS_PRICE || "0.015uinit",
  mnemonic: process.env.RESOLVER_MNEMONIC,
  privateKey: process.env.RESOLVER_PRIVATE_KEY,
  port: parseInt(process.env.PORT || "8080", 10),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "2000", 10),
};

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[fatal] missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// ---------------------------------------------------------------------------
// SSE hub
// ---------------------------------------------------------------------------

const clients = new Set(); // Set<express.Response>

function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const res of clients) {
    try {
      sseSend(res, event, data);
    } catch {
      clients.delete(res);
    }
  }
}

function startServer(getLatestRoundId) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true, clients: clients.size, round: getLatestRoundId() });
  });

  // Resolved-round history with payout/mint tx hashes + winner addresses, so the
  // frontend history tables can link the transaction that paid INIT + minted $ZERO.
  app.get("/history", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, MAX_HISTORY);
    res.json(history.slice(0, limit));
  });

  app.get("/round/:id", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    const rid = Number(req.params.id);
    res.json(history.find((h) => h.roundId === rid) || null);
  });

  app.get("/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": "*",
    });
    res.flushHeaders?.();

    clients.add(res);
    sseSend(res, "connected", { round: getLatestRoundId() });

    // Heartbeat keeps proxies (Railway/Vercel/nginx) from closing idle streams.
    const hb = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        /* ignore */
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(hb);
      clients.delete(res);
    });
  });

  app.listen(CONFIG.port, () => {
    console.log(`[sse] listening on :${CONFIG.port} (GET /events, GET /health)`);
  });
}

// ---------------------------------------------------------------------------
// Bot state
// ---------------------------------------------------------------------------

let client;
let wallet;
let fulfillerAddr;

let latestRoundId = 0; // for the `connected` payload + /health
let busy = false; // single-flight guard so overlapping polls don't double-submit
const handledRounds = new Set(); // round ids we've already resolved/skipped this process

// Resolved-round history (newest-first) so the frontend can show payout/mint tx links.
// Each record: { roundId, txHash, skipped, winningCell, players, isBonus,
//                initPerWinner, zeroPerWinner, winners:[addr], ts }
const MAX_HISTORY = 200;
const history = [];
function recordResolved(rec) {
  history.unshift(rec);
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
}

// cell_picked diffing: remember last seen per-cell counts for the active round
let watchRoundId = 0n;
let lastCounts = null; // number[25] | null

// ---------------------------------------------------------------------------
// cell_picked detection (best-effort, polling diff of get_cell_counts)
// ---------------------------------------------------------------------------
//
// We cannot know *which* player picked from counts alone, so `player` is emitted
// as null. The frontend's useResolverSSE only needs roundId + cell to bump its
// local heatmap, so a null player is fine. If exact player attribution is needed,
// switch to indexing the on-chain CellPicked event via rest.tx.searchEvents
// (gridzero, "game") instead of count diffing.
// TODO(player-attribution): emit real `player` by reading the CellPicked event log.
async function pollCellPicks(round) {
  try {
    if (round.roundId !== watchRoundId) {
      // New round: reset baseline (don't replay the whole grid as picks).
      watchRoundId = round.roundId;
      lastCounts = await getCellCounts(client, CONFIG.moduleAddr, round.roundId);
      return;
    }
    const counts = await getCellCounts(client, CONFIG.moduleAddr, round.roundId);
    if (lastCounts) {
      for (let cell = 0; cell < counts.length; cell++) {
        const delta = (counts[cell] || 0) - (lastCounts[cell] || 0);
        for (let k = 0; k < delta; k++) {
          broadcast("cell_picked", {
            roundId: Number(round.roundId),
            player: null, // see TODO above
            cell,
          });
        }
      }
    }
    lastCounts = counts;
  } catch (err) {
    // Non-fatal: heatmap liveness is a nice-to-have; the frontend also polls RPC.
    console.warn(`[cell_picked] poll error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

async function handleFinishedRound(round) {
  const rid = round.roundId;
  const ridNum = Number(rid);

  if (handledRounds.has(ridNum)) return; // already done in this process
  handledRounds.add(ridNum);

  try {
    if (round.totalPlayers > 0) {
      const vrf = crypto.randomBytes(32);
      console.log(
        `[resolve] round ${ridNum}: ${round.totalPlayers} players -> resolve_round (vrf ${vrf
          .toString("hex")
          .slice(0, 12)}...)`
      );
      const res = await resolveRound(wallet, client, CONFIG.moduleAddr, rid, vrf);
      const txHash = res?.txhash;

      // Read the finalized round to learn the winning cell + bonus flag.
      const detail = await getRound(client, CONFIG.moduleAddr, rid).catch(() => null);
      const winningCell = detail ? detail.winningCell : null;
      const players = detail ? detail.totalPlayers : round.totalPlayers;
      const isBonus = detail ? detail.isBonus : false;

      console.log(
        `[resolve] round ${ridNum} resolved: winningCell=${winningCell} bonus=${isBonus} tx=${txHash}`
      );

      // Capture the winner addresses so the frontend can link the payout/mint tx
      // to each winner's wallet.
      let winners = [];
      if (winningCell != null) {
        winners = await getCellPlayers(client, CONFIG.moduleAddr, rid, winningCell).catch(() => []);
      }
      recordResolved({
        roundId: ridNum, txHash, skipped: false, winningCell, players, isBonus,
        initPerWinner: detail ? detail.initPerWinner.toString() : "0",
        zeroPerWinner: detail ? detail.zeroPerWinner.toString() : "0",
        winners, ts: Date.now(),
      });

      broadcast("round_resolved", {
        roundId: ridNum,
        skipped: false,
        winningCell,
        players,
        txHash,
        winners,
        isBonus,
      });
      if (isBonus) {
        broadcast("bonus_round", { roundId: ridNum, winningCell, players, txHash });
      }
    } else {
      console.log(`[skip] round ${ridNum}: 0 players -> skip_empty_round`);
      const res = await skipEmptyRound(wallet, client, CONFIG.moduleAddr, rid);
      const txHash = res?.txhash;
      console.log(`[skip] round ${ridNum} skipped: tx=${txHash}`);

      recordResolved({
        roundId: ridNum, txHash, skipped: true, winningCell: null, players: 0,
        isBonus: false, initPerWinner: "0", zeroPerWinner: "0", winners: [], ts: Date.now(),
      });
      broadcast("round_resolved", {
        roundId: ridNum,
        skipped: true,
        winningCell: null,
        players: 0,
        txHash,
      });
    }
  } catch (err) {
    // Allow a retry on the next poll (e.g. the round just barely wasn't over yet,
    // a sequence mismatch, or a transient REST error).
    handledRounds.delete(ridNum);
    console.error(`[resolve] round ${ridNum} failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

async function tick() {
  if (busy) return; // don't overlap a slow resolve with the next poll
  busy = true;
  try {
    const round = await getCurrentRound(client, CONFIG.moduleAddr);
    latestRoundId = Number(round.roundId);

    // Live heatmap (best-effort).
    await pollCellPicks(round);

    // A round is ready to be acted on once its window has elapsed and it has not
    // been resolved on-chain yet.
    if (round.timeRemaining === 0 && !round.resolved) {
      await handleFinishedRound(round);
    }
  } catch (err) {
    console.error(`[poll] error: ${err.message}`);
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function main() {
  client = makeClient({
    rest: CONFIG.rest,
    chainId: CONFIG.chainId,
    gasPrice: CONFIG.gasPrice,
  });
  const key = makeKey({ mnemonic: CONFIG.mnemonic, privateKey: CONFIG.privateKey });
  wallet = makeWallet(client, key);
  fulfillerAddr = wallet.key.accAddress;

  console.log("===========================================");
  console.log(" gridZERO initia resolver / fulfiller bot");
  console.log("===========================================");
  console.log(`  chain:      ${CONFIG.chainId}`);
  console.log(`  rest:       ${CONFIG.rest}`);
  console.log(`  module:     ${CONFIG.moduleAddr}::game`);
  console.log(`  fulfiller:  ${fulfillerAddr}`);
  console.log(`  gas price:  ${CONFIG.gasPrice}`);
  console.log(`  poll every: ${CONFIG.pollIntervalMs}ms`);
  console.log("-------------------------------------------");
  console.log(
    "  NOTE: this address must be set on-chain as the fulfiller via"
  );
  console.log(
    "        gridzero::game::set_fulfiller, and funded with INIT for gas."
  );
  console.log("===========================================");

  startServer(() => latestRoundId);

  // Kick once immediately, then on the configured interval.
  await tick();
  setInterval(tick, CONFIG.pollIntervalMs);
}

main().catch((err) => {
  console.error(`[fatal] ${err.stack || err.message}`);
  process.exit(1);
});

// ═══════════════════════════════════════════════════════════════
// initia.js — ALL Initia SDK / network access for gridZERO lives here.
//
// gridZERO ported from Base (EVM) to Initia mainnet (MoveVM, interwoven-1).
// Move package: gridzero::game + gridzero::zero_token published at
// NEXT_PUBLIC_GRIDZERO_ADDR. Entry currency is native INIT (uinit, 6 dec).
//
// SDKs (verified against the shipped type defs / bundle):
//   @initia/initia.js@1.1.0
//     - RESTClient(url, { chainId, gasPrices })          client/rest/RESTClient.d.ts
//     - client.move.viewFunction(addr, mod, fn, type_args[], args[])  → decoded JSON
//         args are base64-BCS-encoded strings (POST .../view_functions/{fn})
//     - client.bank.balanceByDenom(addr, denom) → Coin   client/rest/api/BankAPI.d.ts
//     - MsgExecute(sender, module_address, module_name, function_name, type_args[], args[])
//         core/move/msgs/MsgExecute.d.ts — args are base64-BCS strings
//     - MsgSend(from, to, Coins.Input)                   core/bank/msgs/MsgSend.d.ts
//     - bcs.{u8,u64,address,...}().serialize(v).toBase64()  util/bcs.d.ts (@mysten/bcs)
//   @initia/react-wallet-widget@1.9.8
//     - useWallet().requestInitiaTx({ msgs: Msg[], memo }, options) → txHash
//       (see Providers.js / TheGrid.js — those import the React hooks)
//
// VERIFY (docs): https://docs.initia.xyz  → SDKs / initia.js ; "Move view function"
// ═══════════════════════════════════════════════════════════════

import { RESTClient, APIRequester, MsgExecute, MsgSend, bcs } from "@initia/initia.js";

// ─── Chain config ───
export const CHAIN_ID = process.env.NEXT_PUBLIC_INITIA_CHAIN_ID || "interwoven-1";
export const REST_URL = process.env.NEXT_PUBLIC_INITIA_REST || "https://rest.initia.xyz";
export const RPC_URL = process.env.NEXT_PUBLIC_INITIA_RPC || "https://rpc.initia.xyz";
export const EXPLORER = `https://scan.initia.xyz/${CHAIN_ID}`;

export const GRIDZERO_ADDR = process.env.NEXT_PUBLIC_GRIDZERO_ADDR || "";
export const GAME_MODULE = "game";
export const ZERO_MODULE = "zero_token";

// Native gas + entry token.
export const GAS_DENOM = "uinit";
export const GAS_PRICE = "0.015uinit";
export const INIT_DECIMALS = 6; // uinit → INIT
export const ZERO_DECIMALS = 6; // $ZERO native fungible asset

// ─── Shared REST client (reads). Wallet handles writes via requestInitiaTx. ───
// Hard per-request timeout (axios) on EVERY chain read. The REST node can
// occasionally accept a connection and then hang with no response (Railway
// cold-start / idle / a TCP blip with no FIN). Without a timeout the underlying
// axios request waits indefinitely, which wedges the frontend poll loop (its
// in-flight guard never resets). A timed-out request rejects with ECONNABORTED
// instead, so callers' catch/finally run and polling self-heals on the next tick.
export const REST_TIMEOUT_MS = 8000;
export const rest = new RESTClient(
  REST_URL,
  { chainId: CHAIN_ID, gasPrices: GAS_PRICE },
  new APIRequester(REST_URL, { timeout: REST_TIMEOUT_MS })
);

// ═══════════════════════════════════════════════════════════════
// BCS arg encoding — Move entry/view args must be base64-BCS strings.
// ═══════════════════════════════════════════════════════════════
export const encU8 = (n) => bcs.u8().serialize(Number(n)).toBase64();
export const encU64 = (n) => bcs.u64().serialize(String(n)).toBase64();
export const encAddr = (a) => bcs.address().serialize(a).toBase64();

// ═══════════════════════════════════════════════════════════════
// VIEW HELPERS — read-only Move views. Return decoded JSON values.
// All numbers from Move (u64) arrive as strings; callers coerce.
// ═══════════════════════════════════════════════════════════════
async function gameView(fn, args = [], typeArgs = []) {
  // viewFunction returns the already-decoded return value.
  return rest.move.viewFunction(GRIDZERO_ADDR, GAME_MODULE, fn, typeArgs, args);
}

// get_current_round(): (round_id, start_time, end_time, total_deposits,
//                       total_players, time_remaining, resolved)
export async function getCurrentRound() {
  const r = await gameView("get_current_round");
  // Tuple decodes to an array.
  return {
    roundId: Number(r[0]),
    startTime: Number(r[1]),
    endTime: Number(r[2]),
    totalDeposits: String(r[3]),
    totalPlayers: Number(r[4]),
    timeRemaining: Number(r[5]),
    resolved: Boolean(r[6]),
  };
}

// get_cell_counts(round_id): vector<u64> (len 25)
export async function getCellCounts(roundId) {
  const v = await gameView("get_cell_counts", [encU64(roundId)]);
  return (v || []).map((x) => Number(x));
}

// get_round(round_id): (winning_cell, resolved, is_bonus, init_per_winner,
//   zero_per_winner, total_players, total_deposits, start_time, end_time)
export async function getRound(roundId) {
  const r = await gameView("get_round", [encU64(roundId)]);
  return {
    winningCell: Number(r[0]),
    resolved: Boolean(r[1]),
    isBonus: Boolean(r[2]),
    initPerWinner: String(r[3]),
    zeroPerWinner: String(r[4]),
    totalPlayers: Number(r[5]),
    totalDeposits: String(r[6]),
    startTime: Number(r[7]),
    endTime: Number(r[8]),
  };
}

// has_joined(round_id, who): bool
export async function hasJoined(roundId, who) {
  if (!who) return false;
  return Boolean(await gameView("has_joined", [encU64(roundId), encAddr(who)]));
}

// get_player_cell(round_id, who): u8 (255 = not joined)
export async function getPlayerCell(roundId, who) {
  if (!who) return 255;
  return Number(await gameView("get_player_cell", [encU64(roundId), encAddr(who)]));
}

// get_config(): (entry_fee, round_duration, protocol_fee_bps, resolver_reward,
//   zero_per_round, motherlode_per_round, bonus_round_odds, bonus_multiplier,
//   fulfiller, fee_recipient)
export async function getConfig() {
  const r = await gameView("get_config");
  return {
    entryFee: String(r[0]),
    roundDuration: Number(r[1]),
    protocolFeeBps: Number(r[2]),
    resolverReward: String(r[3]),
    zeroPerRound: String(r[4]),
    motherlodePerRound: String(r[5]),
    bonusRoundOdds: Number(r[6]),
    bonusMultiplier: Number(r[7]),
    fulfiller: r[8],
    feeRecipient: r[9],
  };
}

// escrow_balance(): u64 — INIT held in the game escrow (treasury) as raw uinit string.
export async function getEscrowBalance() {
  try {
    const r = await gameView("escrow_balance");
    return String(r);
  } catch {
    return "0";
  }
}

// accumulated_fees(): u64 — protocol fees accrued (raw uinit string).
export async function getAccumulatedFees() {
  try {
    const r = await gameView("accumulated_fees");
    return String(r);
  } catch {
    return "0";
  }
}

// zero_token::metadata_address(): address
let _zeroMetaCache = process.env.NEXT_PUBLIC_ZERO_METADATA || null;
export async function getZeroMetadata() {
  if (_zeroMetaCache) return _zeroMetaCache;
  _zeroMetaCache = await rest.move.viewFunction(
    GRIDZERO_ADDR, ZERO_MODULE, "metadata_address", [], []
  );
  return _zeroMetaCache;
}

// ═══════════════════════════════════════════════════════════════
// BALANCE HELPERS
// ═══════════════════════════════════════════════════════════════

// Native INIT balance (uinit). Returns raw integer string (6 dec).
export async function getInitBalance(addr) {
  if (!addr) return "0";
  try {
    const coin = await rest.bank.balanceByDenom(addr, GAS_DENOM);
    return coin?.amount ? String(coin.amount) : "0";
  } catch {
    return "0";
  }
}

// $ZERO balance — $ZERO is a native fungible asset. Its bank denom is
// `move/<metadata-hex-without-0x>` (verified on mainnet: querying the raw 0x
// metadata address 500s; the `move/...` denom returns the balance).
export async function getZeroBalance(addr) {
  if (!addr) return "0";
  try {
    const meta = await getZeroMetadata();
    if (!meta) return "0";
    const denom = `move/${String(meta).replace(/^0x/, "")}`;
    const coin = await rest.bank.balanceByDenom(addr, denom);
    return coin?.amount ? String(coin.amount) : "0";
  } catch {
    return "0";
  }
}

// ═══════════════════════════════════════════════════════════════
// TX BUILDERS — return @initia/initia.js Msg objects.
// Send with wallet.requestInitiaTx({ msgs: [msg] }, { gas?, fee? }).
// ═══════════════════════════════════════════════════════════════

// gridzero::game::pick_cell(player, cell: u8) — costs entry_fee INIT.
// `player` arg is the signer (provided implicitly as the &signer); only the
// `cell` arg is BCS-encoded.
export function buildPickCellMsg(sender, cell) {
  return new MsgExecute(
    sender,
    GRIDZERO_ADDR,
    GAME_MODULE,
    "pick_cell",
    [],               // type_args
    [encU8(cell)]     // args: cell: u8
  );
}

// Native INIT transfer (withdraw). amount is a raw uinit integer string.
export function buildWithdrawMsg(from, to, rawAmount) {
  return new MsgSend(from, to, `${rawAmount}${GAS_DENOM}`);
}

// Convert a human INIT amount (e.g. "1.5") to raw uinit integer string.
export function toRawUinit(human) {
  const [whole, frac = ""] = String(human).trim().split(".");
  const fracPadded = (frac + "0".repeat(INIT_DECIMALS)).slice(0, INIT_DECIMALS);
  const raw = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  return raw || "0";
}

// init1... bech32 sanity check.
export function isInitAddress(a) {
  return /^init1[0-9a-z]{38,}$/.test(String(a).trim());
}

// ═══════════════════════════════════════════════════════════════
// RESOLVER HISTORY — off-chain resolved-round records (payout/mint tx hash
// + winner addresses) from the resolver service. Best-effort; never throws.
// GET ${NEXT_PUBLIC_RESOLVER_URL}/history?limit=N → newest-first JSON array of
//   { roundId, txHash, skipped, winningCell, players, isBonus,
//     initPerWinner, zeroPerWinner, winners[], ts }
// ═══════════════════════════════════════════════════════════════
export async function getResolverHistory(limit = 80) {
  const url = process.env.NEXT_PUBLIC_RESOLVER_URL || "";
  if (!url) return [];
  try {
    const base = url.replace(/\/$/, "");
    const res = await fetch(`${base}/history?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

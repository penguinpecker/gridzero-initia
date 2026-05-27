// src/initia.js
// All Initia chain access is isolated behind the small named functions exported
// here. Nothing else in the bot imports @initia/initia.js directly, so if an SDK
// signature turns out to differ from what is documented, this is the only file
// that needs to change.
//
// SDK reference (all VERIFY notes point at these):
//   - npm: @initia/initia.js@1.1.0  (installed type defs inspected directly)
//   - Integration example (RESTClient + Wallet + MsgExecute + bcs + viewFunction):
//     https://github.com/initia-labs/initia.js  (README "Integration Example")
//   - Quickstart: https://docs.initia.xyz/developers/developer-guides/tools/sdks/initia-js/quickstart

import {
  RESTClient,
  Wallet,
  MnemonicKey,
  RawKey,
  MsgExecute,
  bcs,
} from "@initia/initia.js";

const MODULE_NAME = "game";

// ---------------------------------------------------------------------------
// Client + wallet construction
// ---------------------------------------------------------------------------

/**
 * Build a RESTClient for the configured chain.
 *
 * VERIFY: new RESTClient(URL, { chainId, gasPrices, gasAdjustment })
 *   - RESTClientConfig type: dist/client/rest/RESTClient.d.ts
 *   - example: https://github.com/initia-labs/initia.js (README)
 */
export function makeClient({ rest, chainId, gasPrice, gasAdjustment = "1.75" }) {
  return new RESTClient(rest, {
    chainId,
    gasPrices: gasPrice, // e.g. "0.015uinit"  (Coins.Input accepts this string form)
    gasAdjustment,
  });
}

/**
 * Build a Key from env. Prefers a mnemonic; falls back to a raw hex private key.
 * The key is never logged.
 *
 * VERIFY: MnemonicKey({ mnemonic }) and RawKey.fromHex(hex)
 *   - dist/key/MnemonicKey.d.ts, dist/key/RawKey.d.ts
 *   - INIT_COIN_TYPE = 60 is the default; default derivation yields an `init1...`
 *     bech32 address (confirmed at runtime).
 */
export function makeKey({ mnemonic, privateKey }) {
  if (mnemonic && mnemonic.trim()) {
    return new MnemonicKey({ mnemonic: mnemonic.trim() });
  }
  if (privateKey && privateKey.trim()) {
    const hex = privateKey.trim();
    return RawKey.fromHex(hex.startsWith("0x") ? hex : `0x${hex}`);
  }
  throw new Error(
    "No signing key configured: set RESOLVER_MNEMONIC or RESOLVER_PRIVATE_KEY"
  );
}

/**
 * Build a Wallet (signer) bound to the client.
 *
 * VERIFY: new Wallet(rest, key); wallet.key.accAddress gives the `init1...` address.
 *   - dist/client/rest/Wallet.d.ts, dist/key/Key.d.ts (get accAddress)
 */
export function makeWallet(client, key) {
  return new Wallet(client, key);
}

// ---------------------------------------------------------------------------
// View calls (read-only, no signing)
// ---------------------------------------------------------------------------

/**
 * Generic Move view call. Returns the decoded return value directly.
 *
 * For a Move function that returns a tuple, the Initia view JSON returns a JSON
 * array, one element per return value (numbers come back as strings for u64).
 *
 * VERIFY: MoveAPI.viewFunction<T>(address, module_name, function_name, type_args?, args?)
 *   - dist/client/rest/api/MoveAPI.d.ts
 *   - README example uses rest.move.viewFunction(...) and "Returns Move function
 *     output as structured data".
 *   - `args` are BCS-encoded + base64, same as MsgExecute args.
 */
export async function viewFn(client, moduleAddr, fn, args = []) {
  return client.move.viewFunction(moduleAddr, MODULE_NAME, fn, [], args);
}

/**
 * gridzero::game::get_current_round()
 *   -> (round_id, start_time, end_time, total_deposits, total_players,
 *       time_remaining, resolved)
 * Returns a normalized object with numbers (and a bigint-safe round_id).
 */
export async function getCurrentRound(client, moduleAddr) {
  const t = await viewFn(client, moduleAddr, "get_current_round", []);
  // t is a 7-element array. u64 values arrive as strings; coerce safely.
  return {
    roundId: BigInt(t[0]),
    startTime: Number(t[1]),
    endTime: Number(t[2]),
    totalDeposits: BigInt(t[3]),
    totalPlayers: Number(t[4]),
    timeRemaining: Number(t[5]),
    resolved: Boolean(t[6]),
  };
}

/**
 * gridzero::game::get_round(round_id)
 *   -> (winning_cell, resolved, is_bonus, init_per_winner, zero_per_winner,
 *       total_players, total_deposits, start_time, end_time)
 */
export async function getRound(client, moduleAddr, roundId) {
  const args = [serializeU64(roundId)];
  const t = await viewFn(client, moduleAddr, "get_round", args);
  return {
    winningCell: Number(t[0]),
    resolved: Boolean(t[1]),
    isBonus: Boolean(t[2]),
    initPerWinner: BigInt(t[3]),
    zeroPerWinner: BigInt(t[4]),
    totalPlayers: Number(t[5]),
    totalDeposits: BigInt(t[6]),
    startTime: Number(t[7]),
    endTime: Number(t[8]),
  };
}

/**
 * gridzero::game::get_cell_counts(round_id) -> vector<u64> (length 25)
 * Returns an array of 25 numbers.
 */
export async function getCellCounts(client, moduleAddr, roundId) {
  const args = [serializeU64(roundId)];
  const out = await viewFn(client, moduleAddr, "get_cell_counts", args);
  return (out ?? []).map((n) => Number(n));
}

/**
 * gridzero::game::get_cell_players(round_id, cell) -> vector<address>
 * Used to capture the winner addresses for a resolved round.
 */
export async function getCellPlayers(client, moduleAddr, roundId, cell) {
  const args = [serializeU64(roundId), bcs.u8().serialize(Number(cell)).toBase64()];
  const out = await viewFn(client, moduleAddr, "get_cell_players", args);
  return out ?? [];
}

// ---------------------------------------------------------------------------
// BCS argument encoding
// ---------------------------------------------------------------------------

/**
 * Encode a u64 argument for MsgExecute / viewFunction.
 *
 * VERIFY: bcs.u64().serialize(value).toBase64()
 *   - dist/util/bcs.d.ts (bcs export)
 *   - Confirmed at runtime: bcs.u64().serialize('5').toBase64() === 'BQAAAAAAAAA='
 *   - README example: bcs.u64().serialize(10000).toBase64()
 */
export function serializeU64(value) {
  // Accept bigint | number | string — the helper accepts all three.
  return bcs.u64().serialize(value.toString()).toBase64();
}

/**
 * Encode a Move `vector<u8>` (bytes) argument for MsgExecute.
 *
 * VERIFY: bcs.byteVector().serialize(uint8array).toBase64()
 *   - dist/util/bcs.d.ts: byteVector(): BcsType<..., "vector<u8>">
 *   - Confirmed at runtime to produce a length-prefixed vector<u8> encoding.
 */
export function serializeBytes(bytes) {
  return bcs.byteVector().serialize(bytes).toBase64();
}

// ---------------------------------------------------------------------------
// Entry-function execution (signed tx)
// ---------------------------------------------------------------------------

/**
 * Build, sign and broadcast a MsgExecute call against gridzero::game.
 * Returns the broadcast result (includes txhash + code; code !== 0 means failure).
 *
 * VERIFY:
 *   - new MsgExecute(sender, module_address, module_name, function_name, type_args, args)
 *     dist/core/move/msgs/MsgExecute.d.ts (args are base64 BCS strings)
 *   - wallet.createAndSignTx({ msgs, memo? })  dist/client/rest/Wallet.d.ts
 *   - rest.tx.broadcast(signedTx) -> WaitTxBroadcastResult { txhash, code, raw_log, ... }
 *     dist/client/rest/api/TxAPI.d.ts
 *   - README "Integration Example" uses exactly this createAndSignTx + broadcast flow.
 */
export async function executeTx(wallet, client, moduleAddr, fn, args, memo = "") {
  const sender = wallet.key.accAddress;
  const msg = new MsgExecute(sender, moduleAddr, MODULE_NAME, fn, [], args);
  const signedTx = await wallet.createAndSignTx({ msgs: [msg], memo });
  const result = await client.tx.broadcast(signedTx);

  // TxAPI marks failures with a non-zero `code`. Surface it as a thrown error so
  // the caller can re-poll/retry instead of silently treating a revert as success.
  if (result && typeof result.code !== "undefined" && Number(result.code) !== 0) {
    const log = result.raw_log || result.codespace || "unknown error";
    const err = new Error(`tx failed (code=${result.code}): ${log}`);
    err.txhash = result.txhash;
    throw err;
  }
  return result;
}

/**
 * gridzero::game::resolve_round(round_id: u64, vrf: vector<u8>)
 */
export async function resolveRound(wallet, client, moduleAddr, roundId, vrfBytes) {
  const args = [serializeU64(roundId), serializeBytes(vrfBytes)];
  return executeTx(wallet, client, moduleAddr, "resolve_round", args, "gridzero resolve");
}

/**
 * gridzero::game::skip_empty_round(round_id: u64)
 */
export async function skipEmptyRound(wallet, client, moduleAddr, roundId) {
  const args = [serializeU64(roundId)];
  return executeTx(wallet, client, moduleAddr, "skip_empty_round", args, "gridzero skip");
}

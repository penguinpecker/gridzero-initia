# gridZERO initia — resolver / fulfiller bot

Off-chain bot that drives the on-chain rounds of the `gridzero::game` Move module
on Initia mainnet (`interwoven-1`). It is the Initia port of the old Base
resolver, **with all ZK removed** — randomness is now plain `crypto.randomBytes(32)`
and the winning cell is derived on-chain (`keccak256(vrf) % occupied_cells`).

## What it does

Every `POLL_INTERVAL_MS` (default 2s) it calls the view
`gridzero::game::get_current_round()`. When the current round's `time_remaining`
hits `0` and it is not yet `resolved`:

- **players > 0** → submits `resolve_round(round_id, vrf)` with 32 random bytes.
  Winners are paid INIT + minted $ZERO **in the same transaction** (no claim step).
- **players == 0** → submits `skip_empty_round(round_id)`.

After resolving it reads `get_round(round_id)` to log the winning cell and tx hash.

It also runs a small **SSE server** for the frontend (`useResolverSSE.js`) at
`GET /events`, emitting:

| event            | payload                                                        |
| ---------------- | -------------------------------------------------------------- |
| `connected`      | `{ round }`                                                    |
| `round_resolved` | `{ roundId, skipped, winningCell, players, txHash }`           |
| `bonus_round`    | `{ roundId, winningCell, players, txHash }` (Motherlode rounds) |
| `cell_picked`    | `{ roundId, player, cell }` (best-effort; `player` is `null`)  |

`GET /health` returns `{ ok, clients, round }`.

> **cell_picked is best-effort.** It is derived by diffing `get_cell_counts`
> between polls, so it cannot identify *which* player picked — `player` is `null`.
> The frontend only needs `roundId` + `cell` to bump its heatmap. For exact
> player attribution, index the on-chain `CellPicked` event instead (see the
> `TODO(player-attribution)` in `src/resolver.js`).

## Setup

```bash
cd resolver
npm install
cp .env.example .env   # then fill it in
npm start
```

Requires Node 18+ (uses native `fetch`-free SDK + ESM).

## Configuration (`.env`)

| var                   | meaning                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `GRIDZERO_ADDR`       | Published package address; the module called is `<addr>::game`.  |
| `INITIA_CHAIN_ID`     | `interwoven-1`                                                   |
| `INITIA_REST`         | `https://rest.initia.xyz`                                       |
| `INITIA_RPC`          | `https://rpc.initia.xyz` (kept for parity; REST flow is used)    |
| `GAS_PRICE`           | `0.015uinit` (min gas price on interwoven-1; `uinit` = 6 dec)    |
| `RESOLVER_MNEMONIC`   | mnemonic for the fulfiller wallet (**or** `RESOLVER_PRIVATE_KEY`)|
| `RESOLVER_PRIVATE_KEY`| hex private key (alternative to mnemonic)                        |
| `PORT`                | SSE server port (default `8080`)                                 |
| `POLL_INTERVAL_MS`    | poll cadence (default `2000`)                                    |

Provide **exactly one** of `RESOLVER_MNEMONIC` / `RESOLVER_PRIVATE_KEY`. The key
is read from env only and never logged.

## Before it can resolve anything

1. **Fund the fulfiller wallet with INIT.** On boot the bot prints its
   `init1...` address. It pays gas (denom `uinit`, 6 decimals) for every
   `resolve_round` / `skip_empty_round`. Keep a healthy INIT balance.

2. **Authorize it on-chain.** `resolve_round` and `skip_empty_round` are gated to
   the configured `fulfiller`. The game admin must point the contract at this
   wallet:

   ```
   gridzero::game::set_fulfiller(<bot init1... address>)
   ```

   Until that's done, every resolve will revert with `ENOT_FULFILLER`.

## Deploying

Single long-running Node process (e.g. Railway/Fly/a VM). Point the frontend's
`useResolverSSE({ url })` at `https://<your-host>/events`. The SSE stream sends a
`: ping` comment every 15s so reverse proxies don't drop idle connections.

## Architecture

- `src/initia.js` — **all** chain access is isolated here (client, wallet,
  view calls, BCS arg encoding, signed `MsgExecute`). Nothing else imports the
  SDK. Functions carry `// VERIFY:` notes pointing at the `@initia/initia.js`
  type defs / docs they were built against.
- `src/resolver.js` — the poll loop, resolution logic, and SSE server.

### SDK calls used (`@initia/initia.js@1.1.0`)

| purpose             | call                                                                |
| ------------------- | ------------------------------------------------------------------- |
| client              | `new RESTClient(rest, { chainId, gasPrices, gasAdjustment })`       |
| key                 | `new MnemonicKey({ mnemonic })` / `RawKey.fromHex(hex)`             |
| wallet / signer     | `new Wallet(rest, key)`; address via `wallet.key.accAddress`        |
| view                | `rest.move.viewFunction(addr, "game", fn, [], args)`               |
| entry call          | `new MsgExecute(sender, addr, "game", fn, [], args)`               |
| sign + broadcast    | `wallet.createAndSignTx({ msgs })` → `rest.tx.broadcast(signedTx)`  |
| u64 arg             | `bcs.u64().serialize(v).toBase64()`                                 |
| `vector<u8>` arg    | `bcs.byteVector().serialize(bytes).toBase64()`                      |

Reference: [initia.js README integration example](https://github.com/initia-labs/initia.js)
and [docs.initia.xyz](https://docs.initia.xyz/developers/developer-guides/tools/sdks/initia-js/quickstart).

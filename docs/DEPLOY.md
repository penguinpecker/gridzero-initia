# Deploying gridZERO to Initia mainnet

This guide publishes the `gridzero` Move package (modules `gridzero::game` and
`gridzero::zero_token`) to **Initia mainnet** (`interwoven-1`) with the `initiad`
CLI, wires up the resolver, and funds the escrow for Motherlode payouts.

> Commands below are verified against the Initia `x/move` CLI
> (`initiad tx move publish` / `execute`, `initiad query move view`). The
> higher-level `initiad move build` / `initiad move deploy` convenience commands
> are documented per docs.initia.xyz; lines that could not be confirmed
> byte-for-byte against the CLI source are marked `// VERIFY`.

---

## 0. Prerequisites

| Need | Notes |
|:-----|:------|
| `initiad` CLI installed | `initiad version` should print a build |
| A funded **init1…** deployer key | Holds INIT for gas + at least the escrow seed you want for Motherlodes |
| Move toolchain | Pulled automatically via the `InitiaStdlib` git dependency in `move/Move.toml` |

Network constants used throughout:

| Key | Value |
|:----|:------|
| Chain ID | `interwoven-1` |
| RPC (tx broadcast) | `https://rpc.initia.xyz` |
| REST (queries) | `https://rest.initia.xyz` |
| Explorer | `https://scan.initia.xyz/interwoven-1` |
| Gas denom | `uinit` (INIT, 6 decimals) |

Import / confirm your deployer key first:

```bash
# list keys in the local keyring
initiad keys list

# (one-time) import an existing mnemonic under a chosen name
initiad keys add gridzero-deployer --recover    # // VERIFY: keyring-backend per your setup

# note the bech32 address — this is <gridzero-address>
initiad keys show gridzero-deployer -a
```

The package uses the deployer's address as the `gridzero` named address (the
modules are published *under* the deployer account), so
`<gridzero-address>` == the deployer's `init1…` address.

---

## 1. Build

`move/Move.toml` declares `gridzero = "_"`, so the address is supplied at build
time. From the repo root:

```bash
initiad move build \
  --path ./move \
  --named-addresses gridzero=<gridzero-address>
```

This compiles both modules and emits the `.mv` artifacts under
`move/build/gridzero/bytecode_modules/` (`game.mv`, `zero_token.mv`).

> `// VERIFY` — the `--path` flag and build output directory name against your
> `initiad` version. Some builds default `--path` to the current directory; if
> so, `cd move` first and drop `--path`.

---

## 2. Publish

Both modules ship in a single package publish. The recommended path is the
one-step `move deploy` (compile + publish):

```bash
initiad move deploy \
  --path ./move \
  --named-addresses gridzero=<gridzero-address> \
  --upgrade-policy COMPATIBLE \
  --from gridzero-deployer \
  --gas auto --gas-adjustment 1.5 \
  --gas-prices 0.015uinit \
  --node https://rpc.initia.xyz \
  --chain-id interwoven-1
```

> `// VERIFY` — `initiad move deploy` is the documented convenience command on
> docs.initia.xyz. The confirmed-from-source low-level equivalent is to build
> (step 1) then publish the compiled `.mv` files directly:

```bash
initiad tx move publish \
  move/build/gridzero/bytecode_modules/game.mv \
  move/build/gridzero/bytecode_modules/zero_token.mv \
  --upgrade-policy COMPATIBLE \
  --from gridzero-deployer \
  --gas auto --gas-adjustment 1.5 \
  --gas-prices 0.015uinit \
  --node https://rpc.initia.xyz \
  --chain-id interwoven-1
```

`--upgrade-policy COMPATIBLE` keeps future upgrades backward-compatible; use
`IMMUTABLE` to lock the code permanently.

### What `init_module` does automatically

You do **not** call any initializer. On publish, the MoveVM runs each module's
`init_module(deployer)`:

- `zero_token::init_module` — creates the **$ZERO** native fungible asset
  (name `GridZero`, symbol `ZERO`, 6 decimals) and stores the mint/burn/freeze
  `Caps` at `@gridzero`.
- `game::init_module` — creates the named **escrow object** (`gridzero_escrow`,
  the INIT pot custody object), seeds the default config (entry fee 1 INIT,
  60s rounds, 5% fee, 0.1 INIT resolver reward, 100/1000 ZERO emission, 1-in-100
  Motherlode at 10×), sets `admin = fulfiller = fee_recipient = deployer`, and
  **opens round #1**.

So immediately after publish the game is live with round #1 open and the
deployer acting as fulfiller.

---

## 3. Set the resolver (fulfiller) wallet

`init_module` sets the fulfiller to the deployer. Point it at the resolver
bot's wallet so only that wallet can `resolve_round`:

```bash
initiad tx move execute \
  <gridzero-address> game set_fulfiller \
  --args '["address:<fulfiller-address>"]' \
  --from gridzero-deployer \
  --gas auto --gas-adjustment 1.5 \
  --gas-prices 0.015uinit \
  --node https://rpc.initia.xyz \
  --chain-id interwoven-1
```

Optionally repoint the fee recipient and admin the same way:

```bash
initiad tx move execute <gridzero-address> game set_fee_recipient \
  --args '["address:<fee-recipient-address>"]' \
  --from gridzero-deployer --gas auto --gas-adjustment 1.5 \
  --gas-prices 0.015uinit --node https://rpc.initia.xyz --chain-id interwoven-1
```

> Fund the fulfiller wallet with a little INIT for gas. It then earns
> `resolver_reward` (0.1 INIT) per resolution and becomes self-sustaining.

---

## 4. Fund the escrow for Motherlode

Motherlode rounds pay up to `bonus_multiplier`× (10×) the normal distributable
amount, drawn from the escrow over and above the current pot + banked fees.
Seed the escrow so a Motherlode can actually pay out. `fund_treasury` is open to
anyone and takes a `u64` amount in `uinit`:

```bash
# fund 500 INIT (500_000_000 uinit) into the escrow
initiad tx move execute \
  <gridzero-address> game fund_treasury \
  --args '["u64:500000000"]' \
  --from gridzero-deployer \
  --gas auto --gas-adjustment 1.5 \
  --gas-prices 0.015uinit \
  --node https://rpc.initia.xyz \
  --chain-id interwoven-1
```

---

## 5. Verify with view queries

Queries hit REST and need no signing key. Use the deployer address as the
module owner.

```bash
# active round: (round_id, start, end, total_deposits, total_players, time_remaining, resolved)
initiad query move view \
  <gridzero-address> game get_current_round \
  --node https://rest.initia.xyz

# full config: (entry_fee, round_duration, fee_bps, resolver_reward,
#   zero_per_round, motherlode_per_round, bonus_round_odds, bonus_multiplier,
#   fulfiller, fee_recipient)
initiad query move view \
  <gridzero-address> game get_config \
  --node https://rest.initia.xyz

# escrow balance (uinit) and banked protocol fees
initiad query move view <gridzero-address> game escrow_balance --node https://rest.initia.xyz
initiad query move view <gridzero-address> game accumulated_fees --node https://rest.initia.xyz

# heatmap for a round (player count per cell, length 25)
initiad query move view \
  <gridzero-address> game get_cell_counts \
  --args '["u64:1"]' \
  --node https://rest.initia.xyz

# $ZERO asset id to use in clients
initiad query move view \
  <gridzero-address> zero_token metadata_address \
  --node https://rest.initia.xyz
```

> `// VERIFY` — `initiad query move view` accepts `--node` pointing at the REST
> endpoint in current builds. If your build expects an RPC/gRPC node for
> queries, use `https://rpc.initia.xyz` instead.

---

## 6. Manual resolve (smoke test)

The resolver bot normally drives this, but you can resolve by hand once a round
has ended. `vrf` is a `vector<u8>` — pass 32 random bytes as `raw_hex` (the
`game` module hashes it with keccak256 on-chain to pick the winner):

```bash
initiad tx move execute \
  <gridzero-address> game resolve_round \
  --args '["u64:1", "raw_hex:0x<64-hex-chars-of-entropy>"]' \
  --from gridzero-deployer \
  --gas auto --gas-adjustment 1.5 \
  --gas-prices 0.015uinit \
  --node https://rpc.initia.xyz \
  --chain-id interwoven-1
```

(If round #1 had no players, call `skip_empty_round` with just `'["u64:1"]'`
instead.)

> `// VERIFY` — the `vector<u8>` arg encoding. The CLI lists `raw_hex` and
> `raw_base64` as supported types for byte vectors; `raw_hex:0x…` is the
> expected form. `vector<u8>:..,..` (comma-separated decimals) is the fallback.

---

## Post-deploy checklist

- [ ] `get_current_round` shows round #1 open with the expected `end_time`.
- [ ] `get_config` shows the seeded defaults and your intended `fulfiller`.
- [ ] Fulfiller wallet holds gas INIT.
- [ ] Escrow funded for at least one Motherlode (`escrow_balance`).
- [ ] Fill `<gridzero-address>` into the README links, the frontend `.env`, and
      the resolver `.env`.
- [ ] Resolver bot is running and resolving rounds on schedule.

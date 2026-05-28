<p align="center">
  <img src="https://img.shields.io/badge/Chain-gridzero--1-2B6BFF?style=for-the-badge" />
  <img src="https://img.shields.io/badge/VM-MoveVM-black?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Bridge-OPinit_47-black?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Status-LIVE-2B6BFF?style=for-the-badge" />
</p>

<h1 align="center">◇ ◈ &nbsp; G R I D Z E R O &nbsp; ◈ ◇</h1>

<p align="center">
  An on-chain 5×5 lottery game running as its own appchain on <a href="https://initia.xyz">Initia</a>.<br/>
  Pick a cell. Wait 60 seconds. Winner takes the pot — atomic payout, no claim step.
</p>

<p align="center">
  <a href="https://gridzero-initia.vercel.app/play"><strong>▶ Play</strong></a>
  &nbsp;·&nbsp;
  <a href="https://scan.initia.xyz/interwoven-1/accounts/init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc"><strong>L1 modules</strong></a>
  &nbsp;·&nbsp;
  <a href="https://gridzero-sequencer-production.up.railway.app/status"><strong>L2 status</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/initia-labs/initia-registry/pull/835"><strong>Registry PR #835</strong></a>
</p>

---

## Overview

gridZERO is the **`gridzero-1`** appchain on Initia mainnet — a single-purpose MiniMove rollup whose only job is to run one Move package: `gridzero::game` + `gridzero::zero_token`. Every 60 seconds a new round opens, players pick one of 25 cells for 1 INIT, and when the round ends a winner is chosen from occupied cells using an on-chain keccak derivation of fulfiller-supplied entropy. INIT prize and $ZERO emission are paid in the same transaction as resolution.

The game was originally a Base-L2 + ZK-VRF system. The Initia port removes ZK entirely (the VRF was never the trust root — the fulfiller always supplied the entropy), swaps USDC for native INIT, and reimplements the game logic as native Move. Gas on `gridzero-1` is free (`fixed_min_gas_price = 0`), so playing costs only the 1 INIT entry.

---

## How a round plays out

```
         ┌─────┬─────┬─────┬─────┬─────┐
   A     │  0  │  1  │  2  │  3  │  4  │
         ├─────┼─────┼─────┼─────┼─────┤
   B     │  5  │  6  │  7  │  8  │  9  │
         ├─────┼─────┼─────┼─────┼─────┤
   C     │ 10  │ 11  │ 12  │ 13  │ 14  │
         ├─────┼─────┼─────┼─────┼─────┤
   D     │ 15  │ 16  │ 17  │ 18  │ 19  │
         ├─────┼─────┼─────┼─────┼─────┤
   E     │ 20  │ 21  │ 22  │ 23  │ 24  │
         └─────┴─────┴─────┴─────┴─────┘
            1     2     3     4     5
```

| Step | What happens |
|:----:|:--|
| **1. Open** | A new 60s round opens, anchored to L2 block time. |
| **2. Pick** | Anyone calls `game::pick_cell(cell)` — costs 1 INIT, one cell per address per round. The pot grows. |
| **3. Close** | At `close_ts`, the round is closed to new picks. |
| **4. Resolve** | The resolver bot submits 32 random bytes; the contract derives `winning_cell = keccak256(vrf) % occupied_cells`. Picking from occupied cells only guarantees a winner whenever picks > 0. |
| **5. Pay** | Same transaction: winners get the pot (minus 5% fee + 0.1 INIT resolver tip) **and** are minted `$ZERO`. Next round auto-opens. |

A round with zero players is closed via `skip_empty_round` — no payout, no emission, no roll-forward.

### Strategy tradeoff

| Play | When it pays |
|:--|:--|
| **The crowd** — pick a popular cell | Higher chance to share the win, but split pot. |
| **The loner** — pick an empty cell | If only you picked it and `keccak256(vrf) % occupied` lands there, you take the entire pot. |
| **The analyst** — read the heatmap | Edges between crowded and empty cells; play the meta. |

---

## The Motherlode

Once every ~100 rounds the resolve produces a bonus round, decided by a second keccak derivation:

```move
let is_bonus = keccak256(vrf || b"bonus") % bonus_round_odds == 0;
```

No one (including the fulfiller) can predict which round it'll be — the same VRF bytes decide both the winning cell and the bonus flag.

| | Standard round | 💎 Motherlode |
|:--|:--|:--|
| INIT payout | full pot (95% after fee) | **10× pot** (funded from escrow treasury) |
| $ZERO emission | 100 | **1000** |
| Odds | 99/100 | **1/100** |

---

## $ZERO token

| Property | Value |
|:--|:--|
| Symbol | `$ZERO` |
| Name | `GridZero` |
| Standard | Native Move FA (minitia_std::coin) |
| Decimals | 6 |
| Total supply policy | 1B cap (off-chain policy; on-chain mint cap is unconstrained, restricted only by the friend gate) |
| Minter | `gridzero::game` only — `friend` declaration in `gridzero::zero_token` |
| Metadata object | `0x1ed4c19b0f2410cc1773bf82d5b6d378bb61caeb821ce060018e456e72915924` |
| Bank denom | `move/1ed4c19b0f2410cc1773bf82d5b6d378bb61caeb821ce060018e456e72915924` |

### Per-round payout split

```
   ENTRY POOL = N × 1 INIT
            │
   ┌────────┼────────────────────┐
   ▼        ▼                    ▼
 ┌─────┐  ┌────────────┐  ┌────────────────────┐
 │ 5%  │  │ 0.1 INIT   │  │     remainder      │
 │ fee │  │ resolver   │  │  → split among the │
 │  →  │  │ tip → bot  │  │     winners        │
 │esc. │  │            │  │                    │
 └─────┘  └────────────┘  └────────────────────┘
```

Worked example (verified on round 367, tx [`B179A5C9…262224`](https://gridzero-sequencer-production.up.railway.app/tx?hash=B179A5C9C31A7CE5746ABF3009E9B1ADF3FE429B05BE6DA522F929F8FF262224)):
- 1 player pot = 1.000 INIT
- 0.050 INIT → escrow `accumulated_fees` (admin sweeps via `withdraw_fees`)
- 0.100 INIT → fulfiller (resolver bot)
- 0.850 INIT → winner
- +100 $ZERO minted to winner

---

## Architecture

```
                            User (Vercel app, Initia wallet)
                                       │
                       pick_cell(12)   ▼   1 INIT entry
            ┌───────────────────────────────────────────────────┐
            │                  gridzero-1  (L2)                 │
            │   ┌─────────────────────────────────────────────┐ │
            │   │   gridzero::game    ←friend→   ::zero_token │ │
            │   │   round mgmt, escrow, keccak winner sel.    │ │
            │   └─────────────────────────────────────────────┘ │
            │             ▲                          ▲          │
            │             │ resolve_round(id, vrf)   │ mint     │
            │       ┌─────┴────────┐         ┌───────┴────────┐ │
            │       │ Resolver bot │         │ INIT + $ZERO   │ │
            │       │ (Railway)    │         │   → winner     │ │
            │       └──────────────┘         └────────────────┘ │
            └───────────────────────┬───────────────────────────┘
                                    │ DA batches, output proposals
                                    ▼ deposits relayed
            ┌───────────────────────────────────────────────────┐
            │              interwoven-1  (L1)                   │
            │      OPHost bridge_id 47   +   IBC client/conn    │
            └───────────────────────────────────────────────────┘
                                    ▲
                            ┌───────┴───────────┐
                            │  OPinit executor  │   (Railway, opinitd v1.0.20)
                            │  Hermes relayer   │   (Railway, hermes v1.13.3)
                            └───────────────────┘
```

### Round lifecycle

```
t = 0s    →  Round N opens (open_ts = block timestamp)
              picks: 0   pot: 0
              ▼
t = 0-60s →  players call pick_cell — 1 INIT each
              picks: K   pot: K INIT   heatmap updates
              ▼
t = 60s   →  close_ts reached, no more picks accepted
              ▼
t ≈ 60-90s →  resolver bot calls resolve_round(N, 32-byte-vrf):
                winning_cell = keccak256(vrf) % occupied_cells
                is_bonus     = keccak256(vrf || "bonus") % 100 == 0
                ↳ winners receive INIT + $ZERO atomically
                ↳ 5% fee banked in escrow, 0.1 INIT to fulfiller
                ↳ Round N+1 auto-opens
```

### Why keccak, no ZK, no oracle

The original Base contract wrapped resolver entropy in a Groth16 proof settled on a Substrate chain. On Initia that layer is gone, and nothing is lost in trust terms:

- **The fulfiller always supplied the entropy.** Even with ZK, the resolver chose the seed; the proof only attested to the derivation.
- **Derivation is on-chain.** `keccak256(vrf) % occupied_cells` runs inside `resolve_round` via Initia's native `keccak` module — anyone can recompute the winning cell from the published `vrf` bytes.
- **All events are public.** Winning cell, motherlode flag, every payout — emitted as Move events, queryable via the L2 RPC.
- **Fulfiller is permissioned but separated.** A dedicated `fulfiller` address (not the admin / deployer) is the only signer authorized to call `resolve_round` / `skip_empty_round`. It can't drain the escrow, change config, or upgrade.

Initia exposes no native randomness module; this is the closest faithful replacement.

---

## Chain & contract reference

### `gridzero-1` (the appchain)

| | |
|:--|:--|
| Chain ID | `gridzero-1` |
| L1 | `interwoven-1` (Initia mainnet) |
| Codebase | [`initia-labs/minimove`](https://github.com/initia-labs/minimove) v1.1.12 |
| Bridge ID | **47** |
| Bridge contract on L1 | `init1rlrcdw6qmz6hyscun2t7czcvhwssx78dnrt333lhyz9cmze3wh9sx9qnu9` |
| DA layer | Initia DA |
| Submission interval / finalization | 1 hour / 7 days |
| Native gas | `uinit`, `fixed_min_gas_price = 0` |
| Block time | ~28s (single sequencer) |
| RPC | `https://gridzero-sequencer-production.up.railway.app` |
| REST | `https://gridzero-rest-production.up.railway.app` |
| Genesis | [`…/genesis`](https://gridzero-sequencer-production.up.railway.app/genesis) |

### Move modules

Both modules deployed under `init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc` (hex `0xe4bed97036af970f98feeb5593d6f19b9bca1899`) on **both** chains — original L1 deploy on `interwoven-1` is still live; canonical game now runs on `gridzero-1`.

| Module | Purpose |
|:--|:--|
| `gridzero::game` | Round management, INIT escrow, keccak winner selection, payouts, admin & fulfiller roles |
| `gridzero::zero_token` | $ZERO native FA; friend-gated mint to `gridzero::game` only |

### Entry, view, and admin functions

| Function | Description |
|:--|:--|
| `pick_cell(player, cell: u8)` | Enter the current round, pay entry fee, claim a cell (0–24) |
| `resolve_round(fulfiller, id, vrf: vector<u8>)` | Fulfiller-only: submit VRF, derive winner, auto-pay |
| `skip_empty_round(fulfiller, id)` | Fulfiller-only: close a round with no picks |
| `fund_treasury(donor, amount)` | Anyone donates INIT to the escrow (e.g. to seed motherlodes) |
| `withdraw_fees(admin)` | Admin sweeps `accumulated_fees` to the fee recipient |
| `set_fulfiller / set_admin / set_fee_recipient(admin, addr)` | Admin role rotation |
| `set_entry_fee / set_round_duration / set_protocol_fee_bps / set_resolver_reward / set_zero_per_round / set_motherlode_per_round / set_bonus_round_odds / set_bonus_multiplier(admin, v)` | Admin config setters (each input-validated) |
| `get_current_round / get_round / get_cell_counts / get_cell_players / get_player_cell / has_joined / get_config / escrow_balance / accumulated_fees` | View functions |

### Default config (live)

| Parameter | Value |
|:--|:--|
| `entry_fee` | 1 INIT (`1_000_000 uinit`) |
| `round_duration` | 60s |
| `protocol_fee_bps` | 500 (5%) |
| `resolver_reward` | 0.1 INIT (`100_000 uinit`) |
| `zero_per_round` | 100 $ZERO (`100_000_000`) |
| `motherlode_per_round` | 1000 $ZERO (`1_000_000_000`) |
| `bonus_round_odds` | 100 (1-in-100) |
| `bonus_multiplier` | 10× |
| `fulfiller` | `init12dlruke9paqfm25gtetuzgz843hatc8dngqlsj` |
| `admin` + `fee_recipient` | `init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc` |

### IBC channels (gridzero-1 ↔ interwoven-1)

| Port | gridzero-1 | interwoven-1 |
|:--|:--|:--|
| `transfer` (ICS-20) | `channel-0` | `channel-110` |
| `nft-transfer` (ICS-721) | `channel-1` | `channel-111` |

### OPinit roles on bridge 47

| Role | L1 address |
|:--|:--|
| Bridge executor (creator) | `init1egjtr52u25cyuulph34e02mgtntjxnrwrvpfc6` |
| Output submitter (proposer) | `init1tmtjagw5r8zg0kgl3vzukkr2ack3vnrdqgjg78` |
| Batch submitter | `init1qtm2akzgefqxk8smjaj49x5d34vey3a2ttdtd7` |
| Challenger | `init1yumu4xcpxkwncu620a8pr65sskl7h0wpuacrq6` |

---

## Live infrastructure

Five long-running services backed by Railway, all reachable independently.

| Service | Stack | Purpose |
|:--|:--|:--|
| **Sequencer** | `minimove v1.1.12` (prebuilt linux-x86_64) on `debian:bookworm-slim`; persistent volume; node-home auto-restored from baked tarball | Produces `gridzero-1` blocks |
| **REST proxy** | `caddy:2-alpine` reverse-proxy | Public REST on its own domain (Railway gives one HTTP domain per service) |
| **OPinit executor** | `opinitd v1.0.20` (prebuilt) | DA batch submission, L1→L2 deposit relay, 1h output proposals |
| **Hermes relayer** | `hermes v1.13.3` (prebuilt) on `debian:trixie-slim` (needs glibc 2.41) | IBC packet relay on transfer + nft-transfer channels |
| **Resolver bot** | Node + `@initia/initia.js` + Express SSE | Closes each round (resolve or skip) every 60s, signs as `fulfiller` |

Frontend on Vercel (Next.js 15.1 + React 19 + `@initia/react-wallet-widget`).

---

## Status

**LIVE on Initia mainnet since 2026-05-28**, end-to-end tested (deposit-deploy → publish → pick → resolve → atomic payout → DA batch on L1 — all confirmed on chain).

| | |
|:--|:--|
| ✅ Appchain producing blocks | yes — verifiable at `/status` on the sequencer RPC |
| ✅ L1↔L2 bridge active | bridge 47, executor relaying batches every block, output proposals on the hour |
| ✅ IBC channels open | both `transfer` and `nft-transfer` relayed live by Hermes |
| ✅ Game playable | tested round 367 (single-player, deployer wallet, correct payout) |
| 🟡 Initia Scan listing | pending — [registry PR #835](https://github.com/initia-labs/initia-registry/pull/835) (CodeRabbit ✓, awaiting human review) |
| 🟡 Move source verification | submitted, Celatone verifier currently rejects packages with non-trivial git deps |
| ⚪ Challenger bot | not deployed — `opinitd v1.0.20` doesn't expose challenger as a separate binary |

---

## Links

| | |
|:--|:--|
| Game | https://gridzero-initia.vercel.app |
| Sequencer RPC | https://gridzero-sequencer-production.up.railway.app |
| REST API | https://gridzero-rest-production.up.railway.app |
| Resolver SSE + history | https://gridzero-resolver-production.up.railway.app |
| Source | https://github.com/penguinpecker/gridzero-initia |
| Registry PR | https://github.com/initia-labs/initia-registry/pull/835 |
| L1 modules on Initia Scan | https://scan.initia.xyz/interwoven-1/accounts/init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc |
| OPinit bridge 47 on L1 | https://scan.initia.xyz/interwoven-1/accounts/init1rlrcdw6qmz6hyscun2t7czcvhwssx78dnrt333lhyz9cmze3wh9sx9qnu9 |

---

## Contributors

- [**@penguinpecker**](https://github.com/penguinpecker) — design, build, deploy, ops
- [**Claude Opus 4.7**](https://claude.com/claude-code) — code assistance via Claude Code

---

<p align="center">
  <sub>◇ ◈ &nbsp; trust the math &nbsp; ◈ ◇</sub>
</p>

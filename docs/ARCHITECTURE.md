# gridZERO initia — Architecture & Migration

`gridZERO initia` is a faithful port of the live GridZero game (originally
GridZeroV4 on Base L2) to **Initia mainnet** (`interwoven-1`), rebuilt as native
MoveVM modules. The *game* is unchanged — 5×5 grid, fixed entry fee, a winner
every round, periodic Motherlode bonus rounds. Only the platform changed.

This document maps the old Base/Solidity/ZK components to the new
Initia/Move ones, and explains why the randomness redesign is trust-equivalent.

---

## Old → New component map

| Concern | Base L2 (original) | Initia (this port) |
|:--------|:-------------------|:-------------------|
| **Chain** | Base L2 (OP Stack, EVM) | Initia L1 `interwoven-1` (MoveVM, 500ms blocks) |
| **Contract language** | Solidity | Move |
| **Game contract** | `GridZeroV4.sol` | `gridzero::game` module |
| **Reward token** | `ZeroToken.sol` (ERC-20, minter role) | `gridzero::zero_token` (native fungible asset, `friend`-gated mint) |
| **Entry / pot / payout currency** | USDC (ERC-20, 6 dec) | INIT (`uinit`, native, 6 dec) |
| **Pot custody** | USDC held by the contract | Named escrow `object` (`gridzero_escrow`), signer via `ExtendRef` |
| **Enter a round** | `pickCell(uint8)` | `pick_cell(player, cell: u8)` |
| **Resolve a round** | `resolveRound(bytes vrf, uint256 id)` | `resolve_round(fulfiller, round_id: u64, vrf: vector<u8>)` |
| **Collect winnings** | `claim(roundId)` (pull) | none — winners **auto-paid** inside `resolve_round` (push) |
| **Randomness derivation** | `keccak256(vrfOutput) % 25` over all cells | `keccak256(vrf) % occupied_cells` over occupied cells only |
| **Randomness wrapper** | Groth16 proof via Kurier API, settled on zkVerify (Substrate) | **removed** — on-chain `initia_std::keccak` only |
| **Motherlode trigger** | `keccak256(vrf, "bonus") % 100 == 0` | `keccak256(vrf \|\| "bonus") % 100 == 0` (identical) |
| **Hashing primitive** | EVM `keccak256` precompile | `initia_std::keccak::keccak256` |
| **Roles / access** | `onlyOwner` / resolver role | `admin` + `fulfiller` addresses, asserted in-module |
| **Heatmap / state reads** | `getCellCounts`, `getCurrentRound`, … (EVM views) | `#[view]` functions: `get_cell_counts`, `get_current_round`, `get_round`, `get_config`, … |
| **Frontend SDK** | wagmi + viem | `@initia/initia.js` + `@initia/react-wallet-widget` |
| **Wallet** | Farcaster SDK / Privy | Initia Wallet / Keplr |
| **Resolver bot** | Node.js, WebSocket block listener (Railway) | Node.js `@initia/initia.js` + Express SSE block listener |
| **RPC** | Alchemy (Base) | `rpc.initia.xyz` / `rest.initia.xyz` |
| **History / analytics** | Supabase | Supabase (unchanged) |
| **Explorer** | BaseScan | `scan.initia.xyz/interwoven-1` |

Two notable game-logic refinements that came with the Move port (and are how the
live V4 already behaves): the winner is drawn **only from occupied cells**, so a
round with at least one player always has a winner and the pot never rolls
forward; and payout is **atomic with resolution** (no separate claim step), which
the push-payment model on Initia makes natural.

---

## Why no ZK, and why that's the same trust model

The Base build framed randomness as "ZK-verified VRF": the resolver produced a
VRF output, Kurier generated a Groth16 proof of it, and zkVerify recorded that
proof asynchronously on a Substrate chain.

The important detail: **the off-chain fulfiller always supplied the entropy.**
The ZK layer never *generated* randomness — it was an after-the-fact audit
trail attesting that a value was processed correctly. The actual winning cell
was, on both chains, computed deterministically on-chain from the submitted
bytes via `keccak256(...) % cells`.

Initia exposes **no native randomness module**. The trust-faithful replacement
is therefore not to bolt on an external oracle (which would *add* a trust
assumption the original never had) but to keep the exact original design:

1. The fulfiller (the only wallet allowed by `set_fulfiller`) submits 32 random
   bytes to `resolve_round`.
2. `gridzero::game` derives the winner **on-chain** with the native
   `initia_std::keccak` module: `keccak256(vrf) % occupied_cells`.
3. The Motherlode flag is derived the same way: `keccak256(vrf || "bonus") % bonus_round_odds == 0`.
4. The `vrf` bytes, the resulting `winning_cell`, the `is_bonus_round` flag, and
   every payout are emitted as Move events — fully reconstructible and auditable
   from the explorer by anyone.

Net effect on trust:

| Property | Base (ZK-VRF) | Initia (keccak VRF) |
|:---------|:--------------|:--------------------|
| Who provides entropy | Off-chain fulfiller | Off-chain fulfiller |
| Where the winner is computed | On-chain (EVM keccak) | On-chain (Move keccak) |
| Is derivation publicly recomputable | Yes | Yes |
| External oracle dependency | No | No |
| Extra audit trail | zkVerify (Substrate) | Move events on `interwoven-1` |

The only thing dropped is the asynchronous Substrate audit trail — replaced by
native Move events on the same chain that settled the round. Randomness source,
on-chain derivation, and the absence of any third-party oracle are all
preserved. Hence: **provably fair, fully on-chain randomness — keccak-derived
VRF, no oracle.**

---

## Module layout

```
move/sources/
  zero_token.move   gridzero::zero_token  — $ZERO native fungible asset
                                            (friend-minted by game)
  gridzero.move     gridzero::game        — rounds, pick_cell, resolve_round,
                                            skip_empty_round, escrow custody,
                                            admin setters, #[view]s
```

Both modules are published in one package under `<gridzero-address>` and
self-initialize via `init_module` on publish — see
[`DEPLOY.md`](DEPLOY.md).

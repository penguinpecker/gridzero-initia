<p align="center">
  <img src="https://img.shields.io/badge/Chain-Initia_interwoven--1-black?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Entry-1_INIT-lightgrey?style=for-the-badge" />
  <img src="https://img.shields.io/badge/VM-MoveVM-grey?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Status-Awaiting_Mainnet_Deploy-grey?style=for-the-badge" />
</p>

<h1 align="center">◇ ◈ G R I D Z E R O ◈ ◇</h1>

<p align="center">
  <code>ZERO KNOWLEDGE OF YOUR FATE · FULL DEGEN</code>
</p>

<p align="center">
  A provably fair 5×5 grid game on <strong>Initia</strong>.<br/>
  Pick a cell. Hope the math gods pick the same one.<br/>
  Winner takes the pot. Every <strong>60 seconds</strong>. Forever.
</p>

<p align="center">
  <a href="https://gridzero-one.vercel.app"><strong>▶ Play Now</strong></a> &nbsp;·&nbsp;
  <a href="https://gridzero-miniapp.vercel.app"><strong>◉ Mini App</strong></a> &nbsp;·&nbsp;
  <a href="https://gridzero-one.vercel.app/how-to-play"><strong>◇ How to Play</strong></a>
</p>

---

## WTF is GridZero?

GridZero is an onchain lottery that runs every **60 seconds** on **Initia** (`interwoven-1`).

There's a 5×5 grid. You pick a cell. You pay **1 INIT**. When the round ends, a cryptographically random winning cell is revealed using a keccak-derived VRF (Verifiable Random Function). If you're standing on the winning cell — **you take the pot**.

No house-edge rigging. No backend coin flips. Just pure math, derived on-chain by the native **`keccak` module**, settled in a single MoveVM transaction for anyone to audit.

> **This isn't trust-me-bro gambling. This is trust-the-math gambling.**

---

## 🕹️ How to Play

```
         ┌─────┬─────┬─────┬─────┬─────┐
         │  0  │  1  │  2  │  3  │  4  │
         ├─────┼─────┼─────┼─────┼─────┤
         │  5  │  6  │ ×5  │  8  │  9  │
         ├─────┼─────┼─────┼─────┼─────┤
         │ 10  │ 11  │ YOU │ 13  │ 14  │
         ├─────┼─────┼─────┼─────┼─────┤
         │ 15  │ 16  │ 17  │  ✓  │ 19  │
         ├─────┼─────┼─────┼─────┼─────┤
         │ 20  │ 21  │ 22  │ 23  │ 24  │
         └─────┴─────┴─────┴─────┴─────┘
          ×5 = hot cell    YOU = your pick    ✓ = winner
```

### The Loop

| Step | What Happens |
|:----:|:-------------|
| **01** | **◉ Round Opens** — A new 60-second round begins, anchored to Initia L1 block time |
| **02** | **◇ Pick Your Cell** — Choose any cell on the 5×5 grid. Costs **1 INIT** via `game::pick_cell`. Multiple players can pick the same cell |
| **03** | **◈ Watch the Heatmap** — See where everyone's betting in real-time. Crowded cells split the pot. Lonely cells = full payout |
| **04** | **⬡ VRF Reveals Winner** — The resolver submits 32 random bytes → the contract derives the winner on-chain: `keccak256(vrf) % occupied_cells` |
| **05** | **◆ Auto-Paid** — Winners are paid INIT **and** minted **$ZERO** in the same `resolve_round` transaction. No claim step |

### The Strategy

| Move | Play Style | What Happens |
|:-----|:-----------|:-------------|
| 👥 **The Crowd** | Pick popular cells | More likely someone shares your cell — but lower payout if you win |
| 🐺 **The Loner** | Pick lonely cells | If it hits, you keep the **entire pot**. High risk, max reward |
| 🧠 **The Analyst** | Read the heatmap | Find the edge between crowded and empty. Play the meta-game |

> **The winner is always chosen from OCCUPIED cells only.** As long as at least one player joined, there is always a winner — the pot never rolls forward. A round with zero players is simply skipped (`skip_empty_round`), and no $ZERO is minted.

---

## 💎 The Motherlode

Once every ~100 rounds, something special happens.

A **Motherlode** round triggers — determined by a secondary VRF derivation:

```
keccak256(vrf || "bonus") % 100 == 0
```

You won't know it's a Motherlode until the round resolves. **Every round could be the one.**

|  | Standard Round | 💎 Motherlode |
|:--|:--------------|:-------------|
| **INIT Payout** | Normal pot split | **10× INIT** (funded from escrow treasury) |
| **$ZERO Earned** | 100 ZERO | **1000 ZERO** |
| **Odds** | 99 in 100 | **1 in 100** |

---

## 🪙 $ZERO Token

| Property | Value |
|:---------|:------|
| **Symbol** | $ZERO |
| **Standard** | Native fungible asset on Initia (MoveVM) |
| **Decimals** | 6 |
| **Total Supply** | 1,000,000,000 (1B) policy cap |
| **Emission** | ~100 ZERO per round, split among winners |
| **Daily Rate** | ~144,000 ZERO (at 60s rounds) |
| **Motherlode** | 1000 ZERO on bonus rounds |
| **Minter** | `gridzero::game` only (friend-gated) |
| **Asset ID** | resolve via `zero_token::metadata_address()` after deploy |

### Payout Flow

```
  ┌──────────────────┐
  │   PLAYER POOL    │
  │  N × 1 INIT      │
  └────────┬─────────┘
           │
     ┌─────┼──────────────┐
     ▼     ▼              ▼
  ┌──────┐ ┌───────────┐ ┌────────────────┐
  │  5%  │ │ 0.1 INIT  │ │   THE REST     │
  │ FEE  │ │ RESOLVER  │ │   = PRIZE POOL │
  │  →   │ │  BOT      │ │   → split among│
  │ESCRW │ │           │ │     winners    │
  └──────┘ └───────────┘ └────────────────┘
```

**Example:** 20 players enter, 3 picked the winning cell:
- Pool = **20 INIT**
- Protocol fee (5%) = 1 INIT → escrow (banked as `accumulated_fees`)
- Resolver reward = 0.1 INIT → fulfiller bot
- Prize pool = **18.9 INIT**
- Each winner = **6.3 INIT** + a share of **100 $ZERO**, paid automatically on resolve

---

## 🏗️ Architecture

```
                         ┌──────────────────┐
                         │     PLAYER       │
                         │  Web App or      │
                         │  Mini App        │
                         └────────┬─────────┘
                                  │ pick_cell (1 INIT)
                                  ▼
  ┌──────────────┐      ┌─────────────────┐      ┌──────────────┐
  │              │      │                 │      │              │
  │   keccak     │◀─────│  gridzero::game │─────▶│ gridzero::   │
  │   (native    │ vrf  │  (Initia L1,    │ mint │ zero_token   │
  │    Move      │bytes │   MoveVM)       │ $ZERO│ native FA    │
  │    module)   │─────▶│                 │ on   │ (friend)     │
  │  keccak256   │ %    │  INIT escrow    │ win  └──────────────┘
  │  → winner    │occ.  │  Round mgmt     │
  │              │      │  Winner + payout│
  └──────────────┘      └────────┬────────┘
                                 ▲
                                 │ resolve_round(round_id, vrf)
                        ┌────────┴────────┐
                        │  RESOLVER BOT   │
                        │  Node.js +      │
                        │  @initia/       │
                        │  initia.js      │
                        │  block listener │
                        └─────────────────┘
                                 │
                        ┌────────▼────────┐
                        │    SUPABASE     │
                        │  Round history  │
                        │  + analytics    │
                        └─────────────────┘
```

### Tech Stack

| Layer | Tech | Details |
|:------|:-----|:--------|
| **Chain** | Initia L1 (MoveVM) | `interwoven-1`, 500ms blocks, native Move modules |
| **Entry Currency** | INIT | `uinit`, 6 decimal precision, native gas + entry fee |
| **Randomness** | On-chain keccak VRF | Resolver submits 32 entropy bytes; winner derived on-chain, no oracle |
| **Frontend** | Next.js + @initia/react-wallet-widget + @initia/initia.js | Deployed on Vercel |
| **Wallet** | Initia Wallet / Keplr | Native + external wallet support |
| **Resolver** | Node.js (@initia/initia.js) + Express SSE | Block listener, server-sent events to the app |
| **RPC / REST** | rpc.initia.xyz / rest.initia.xyz | Public Initia mainnet endpoints |
| **Backend** | Supabase | Round tracking + player analytics |

### Round Lifecycle

```
Block N         →  Round #42 starts (start_time = block timestamp)
                   │
Block N+1…N+120 →  Players call pick_cell (60-second window)
                   │  Heatmap updates in real-time
                   │
~Block N+120    →  block timestamp ≥ end_time
                   │
                   ├─ Resolver detects round ended
                   ├─ Generates 32 random bytes as VRF entropy
                   ├─ Calls resolve_round(42, vrf)
                   ├─ Winning cell = keccak256(vrf) % occupied_cells
                   ├─ Motherlode? keccak256(vrf || "bonus") % 100 == 0
                   ├─ Winners auto-paid INIT + minted $ZERO (same tx)
                   ├─ Resolver reward + protocol fee banked
                   ├─ Round #43 auto-starts
                   │
                   └─ (No claim step — payout is atomic with resolution)
```

### Why keccak VRF (and no ZK)?

The original GridZero on Base wrapped its randomness in Groth16 zero-knowledge proofs settled asynchronously on a Substrate chain. On Initia that entire layer is **removed** — and nothing is lost in trust terms:

- **◇ The fulfiller always supplied the entropy.** Even on Base, the off-chain resolver submitted the VRF output; the ZK proof was only an audit trail, not the source of randomness.
- **◇ Derivation is on-chain and deterministic.** `keccak256(vrf) % occupied_cells` runs inside the Move `resolve_round` transaction via Initia's native `keccak` module. Anyone can recompute it from the published `vrf` bytes.
- **◇ Provably fair, fully on-chain.** The winning cell, the Motherlode flag, and every payout are emitted as Move events and visible on the explorer.
- **◇ No oracle dependency.** No Chainlink, no third-party VRF service that could be manipulated — just the fulfiller's entropy and on-chain keccak.

> Initia exposes no native randomness module, so resolver-submitted entropy + on-chain keccak derivation is the faithful, trust-equivalent replacement for the Base ZK-VRF. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## 📄 Smart Contracts

Package `gridzero` publishes two Move modules under `<gridzero-address>` (filled in after deploy — see [`docs/DEPLOY.md`](docs/DEPLOY.md)).

### `gridzero::game` — [`<gridzero-address>`](https://scan.initia.xyz/interwoven-1)

| Function | Description |
|:---------|:------------|
| `pick_cell(player, cell: u8)` | Enter current round — pay 1 INIT, pick cell 0–24 |
| `resolve_round(fulfiller, round_id: u64, vrf: vector<u8>)` | Fulfiller-only: submit VRF entropy → derive winner, auto-pay, open next round |
| `skip_empty_round(fulfiller, round_id: u64)` | Fulfiller-only: close a finished round nobody entered |
| `fund_treasury(donor, amount: u64)` | Top up the escrow (e.g. to fund Motherlode payouts) — anyone may donate INIT |
| `withdraw_fees(admin)` | Admin-only: move banked protocol fees from escrow to the fee recipient |
| `set_fulfiller / set_admin / set_fee_recipient(admin, addr)` | Admin-only role setters |
| `set_entry_fee / set_round_duration / set_protocol_fee_bps / …` | Admin-only config setters |
| `get_current_round()` `#[view]` | Active round info + time remaining |
| `get_round(round_id)` `#[view]` | Resolved round detail (winning cell, payouts, bonus flag) |
| `get_cell_counts(round_id)` `#[view]` | Player count per cell (for the heatmap) |
| `get_cell_players / get_player_cell / has_joined` `#[view]` | Per-player round queries |
| `get_config()` `#[view]` | Current config + fulfiller + fee recipient |
| `escrow_balance / accumulated_fees()` `#[view]` | Escrow pot + banked fees |

### `gridzero::zero_token` — $ZERO

Native Initia fungible asset (the Move-native replacement for the Base ERC-20 `ZeroToken`). Minting is restricted to `gridzero::game` via a `friend` declaration — the game module is the sole authorized minter, exactly as on Base. Views: `metadata()`, `metadata_address()`.

---

## 🚀 Deployment

### Contracts (initiad)

Full step-by-step in [`docs/DEPLOY.md`](docs/DEPLOY.md). The short version:

```bash
# build with your deployer as the gridzero named address
initiad move build --named-addresses gridzero=<gridzero-address>

# publish both compiled modules to mainnet (init_module auto-runs:
# creates the escrow + opens round #1)
initiad move deploy --upgrade-policy COMPATIBLE \
  --from <deployer-key> --gas auto --gas-adjustment 1.5 \
  --gas-prices 0.015uinit \
  --node https://rpc.initia.xyz --chain-id interwoven-1

# point the game at the resolver wallet
initiad tx move execute <gridzero-address> game set_fulfiller \
  --args '["address:<fulfiller-address>"]' \
  --from <deployer-key> --gas auto --gas-adjustment 1.5 \
  --gas-prices 0.015uinit \
  --node https://rpc.initia.xyz --chain-id interwoven-1
```

Or just run [`scripts/deploy.sh`](scripts/deploy.sh) with the env vars set.

### Resolver Bot

```bash
cd resolver/
npm install

export INITIA_RPC=https://rpc.initia.xyz
export INITIA_REST=https://rest.initia.xyz
export CHAIN_ID=interwoven-1
export GRIDZERO_ADDR=<gridzero-address>
export FULFILLER_KEY=...   # mnemonic / key of the wallet set via set_fulfiller

npm start
```

Send some INIT to the fulfiller wallet for gas. The bot earns **0.1 INIT per resolution** — self-sustaining once running.

---

## ⚙️ Configuration

Defaults are seeded by `init_module` and tunable by the admin via the `set_*` entry functions.

| Parameter | Default | What it does |
|:----------|:--------|:-------------|
| `entry_fee` | 1 INIT (`1_000_000` uinit) | Cost to play a round |
| `round_duration` | 60 seconds | How long each round lasts |
| `protocol_fee_bps` | 500 (5%) | Protocol's cut of the pot |
| `resolver_reward` | 0.1 INIT (`100_000` uinit) | Incentive for the resolver bot |
| `zero_per_round` | 100 ZERO | Standard emission per round (split among winners) |
| `motherlode_per_round` | 1000 ZERO | Bonus emission on Motherlode rounds |
| `bonus_round_odds` | 100 | 1-in-N chance of Motherlode |
| `bonus_multiplier` | 10× | INIT multiplier for Motherlode |

---

## 🔗 Links

| | |
|:--|:--|
| 🎮 **Web App** | [gridzero-one.vercel.app](https://gridzero-one.vercel.app) |
| ◉ **Mini App** | [gridzero-miniapp.vercel.app](https://gridzero-miniapp.vercel.app) |
| 📄 **Game Module** | [`gridzero::game`](https://scan.initia.xyz/interwoven-1) — `<gridzero-address>` |
| 🪙 **$ZERO Token** | [`gridzero::zero_token`](https://scan.initia.xyz/interwoven-1) — `<gridzero-address>` |
| ⬡ **Explorer** | [scan.initia.xyz/interwoven-1](https://scan.initia.xyz/interwoven-1) |
| ◆ **Chain** | [Initia](https://initia.xyz) (`interwoven-1`, MoveVM L1) |

---

<p align="center">
  <strong>◇ ◈ TRUST THE MATH · FULL DEGEN ◈ ◇</strong><br/>
  <sub>Built with keccak, bad decisions, and INIT you probably shouldn't be gambling.</sub>
</p>

# gridZERO → its own Initia appchain (MiniMove rollup) — Scope

**Goal:** relaunch gridZERO as its own application-specific rollup ("Minitia") on Initia,
the way every flagship Initia game runs (Yominet, Civitia, etc.) — own chain, own
sequencer, capturing sequencer fees + VIP rewards — while **maximizing Initia-native
tech** for the grant.

> Today gridZERO is Move modules on the **shared L1** (`interwoven-1`). This document
> scopes moving it to a **dedicated MiniMove rollup** (`gridzero-1`). The contracts are
> already Move, so the VM choice is natural and the port is light.

---

## 1. Recommended stack (and why it's grant-optimal)

Ranked by grant value — "built deeply on Initia" is mostly about **VIP + Enshrined
Liquidity on a real MiniMove rollup**:

| # | Initia-native component | What we do with it | Grant signal |
|:--|:--|:--|:--|
| 1 | **VIP** (Vested Interest Program) | Register the rollup; define an **on-chain user-scoring function** that rewards real gameplay (rounds played, $ZERO held/staked, retention). esINIT flows to *our players*. | **Highest** — VIP *is* Initia's on-chain programmatic grant |
| 2 | **MiniMove rollup + OPinit** | Run the actual appchain (sequencer + Executor + Challenger) — the thing that makes us "a real Initia game" | High |
| 3 | **Enshrined Liquidity (INIT:ZERO LP)** | Governance-whitelisted INIT:ZERO pool → stakeable LP that earns trading fees **and** secures the chain | High |
| 4 | **INIT-as-gas (JIT-abstracted)** | Rollup gas = INIT (feeds VIP Balance Pool + captures sequencer fees); players pay in $ZERO at the UX via JIT fee abstraction | High |
| 5 | **Minitswap** | Instant L2→L1 INIT exits (seconds, not the 7-day challenge wait) via our IbcOpINIT pool | Medium |
| 6 | **initia-registry + Initia Wallet + InitiaScan + App hub** | List the chain → auto-surfaced in Wallet, Scan, Bridge, App hub | Table stakes |
| 7 | **Oracle (Connect/Slinky) + INIT Usernames** | USD-denominated entry / dynamic rewards via `minitia_std::oracle`; usernames on the leaderboard | Nice-to-have |

**The single strongest talking point:** one **INIT:ZERO LP** simultaneously powers three
native systems — Enshrined-Liquidity staking, Minitswap instant exits, and the VIP esINIT
**zap target**. That "interwoven" triple-use is exactly what the application should lead with.

---

## 2. Architecture

```
                       Initia L1 (interwoven-1)
   ┌───────────────────────────────────────────────────────────┐
   │  OPHost (bridge, output proposals, 7-day finalization)     │
   │  x/mstaking + Enshrined Liquidity (INIT:ZERO LP staked)    │
   │  VIP: Balance Pool (INIT bridged) + Weight Pool (gauge)    │
   │  Minitswap (INIT ⇄ IbcOpINIT, instant L2→L1)              │
   └───────▲───────────────▲───────────────────▲───────────────┘
           │ OP bridge      │ IBC relayer        │ DA (Celestia or Initia DA)
           │ deposits/      │ transfer/          │ tx batches
           │ withdrawals    │ nft-transfer       │
   ┌───────┴───────────────┴───────────────────┴───────────────┐
   │            gridZERO Minitia  (MiniMove, chain gridzero-1)   │
   │   minitiad sequencer  ·  gas token = INIT (JIT for $ZERO)   │
   │   Move: gridzero::game + gridzero::zero_token (ported)      │
   │   vip_score contract (user gameplay scoring)               │
   └────────────────────────────────────────────────────────────┘
        ▲ Executor bot (deposits, withdrawal Merkle root,
        │   output→OPHost, DA batch post, oracle relay)
        ▲ Challenger bot (fraud detection)
        ▲ Resolver/fulfiller bot (resolve_round) — already built
```

Operator runs (24/7): **sequencer**, **Executor**, **Challenger**, **IBC relayer**,
public **RPC/REST/gRPC + indexer**, and the existing **resolver** bot.

---

## 3. The contract port (light — already Move)

The L2 standard library `minitia_std` is the **same 0x1 stdlib** as L1's `initia_std`,
just a named-address rename. Verified diff: the only L1-only modules absent on MiniMove are
`staking`, `stableswap`, `minitswap`, `incentive` (L1 protocol concerns). Everything
gridZERO uses — `coin`, `managed_coin`, `fungible_asset`/`fa`, `object`, `keccak`, `block`,
`event`, `table`, `oracle`, NFT `token/` — is present on MiniMove.

**Migration steps for `move/sources/`:**
1. `use initia_std::…` → `use minitia_std::…` (same module names/APIs; our own modules at
   `@gridzero` are unchanged).
2. Add a `Move.toml` profile/dep on `MinitiaStdlib`.
3. Rebuild + the existing 5 unit tests should pass unchanged (logic is VM-agnostic).
4. Republish `game` + `zero_token` on `gridzero-1` (fresh deploy; the L1 deploy can stay as
   a "v0 / shared-L1" instance or be retired).
5. Repoint frontend `.env` (`NEXT_PUBLIC_GRIDZERO_ADDR`, `NEXT_PUBLIC_INITIA_REST/RPC/CHAIN_ID`
   → rollup endpoints) and the resolver `.env` to the rollup. Wallet widget chainId → `gridzero-1`.

No gameplay logic changes. The resolver bot works as-is (points at the rollup RPC).

---

## 4. Launch process (Weave CLI)

`weave` (github.com/initia-labs/weave) orchestrates the whole thing:

1. **`weave init`** — create/fund the **Gas Station** operator key (INIT for OPinit txs; TIA if Celestia DA).
2. **`weave rollup launch`** — interactive: select **Move** VM, set **chain id** (`gridzero-1`),
   **gas token** (INIT), **DA layer** (Celestia or Initia DA), enable the **oracle**, set a funded
   genesis account. Generates genesis/config/keys to `~/.minitia/artifacts/`, registers the rollup on
   **OPHost** (creates `op_bridge_id`), and prints RPC(26657)/REST(1317)/gRPC(9090) + an InitiaScan link.
3. **`weave opinit init` → `start executor`** and **`start challenger`** — the two OPinit bots.
4. **`weave relayer init` → `start`** — IBC relayer (`transfer`, `nft-transfer`).
5. Deploy the ported Move package; deploy the **`vip_score`** scoring contract.
6. List in **initia-registry** (`chain.json` + `assetlist.json` + `profile.json` with
   `category: "Gaming"`, `l2: true`, and a `vip` block) via PR.
7. Pursue **L1 governance whitelisting** for (a) **VIP** eligibility and (b) the **INIT:ZERO
   Enshrined-Liquidity** pool.

**Path: testnet first.** Spin the rollup on Initia **testnet**, smoke-test deposit/withdraw/
Minitswap + the VIP scoring + wallet/oracle, register in `testnets/`, then repeat on mainnet.
(Note: our standing "mainnet-only, no devnet" rule is for the real-money Solana projects; for an
Initia grant a public **testnet rollup is the expected proving ground** — recommend we do it.)

---

## 5. Key decisions to lock before building

| Decision | Options | Recommendation |
|:--|:--|:--|
| **DA layer** | Celestia (needs TIA, cheaper at scale) vs Initia DA (INIT-only, most "native", costlier at volume) | **Initia DA** for max-native posture at our volume; Celestia if tx volume spikes |
| **Gas token** | INIT-as-gas vs custom $ZERO gas vs JIT | **INIT-as-gas + JIT** so players pay in $ZERO at UX while INIT feeds VIP Balance Pool |
| **VIP scoring fn** | per-round / $ZERO-staked / retention / combos | reward **repeat gameplay** (aligns with esINIT's 26-epoch vesting); cap per-wallet to resist sybils |
| **Keep L1 deploy?** | retire vs keep as shared-L1 instance | keep live during migration; cut over once rollup is stable |
| **Testnet first?** | yes / straight to mainnet | **testnet first** (grant reviewers expect it; de-risks bots/bridge) |

---

## 6. VIP — how the rewards actually work (the grant engine)

- VIP = **10% of INIT supply over ~7 years**, paid as **esINIT** to rollups **and their users**.
- Per ~2-week epoch, rewards split into **Balance Pool** (∝ INIT bridged onto `gridzero-1`) +
  **Weight Pool** (∝ gauge votes L1 stakers direct to us).
- Operator takes a vested **commission**; the rest goes to **users by VIP Score** (our on-chain
  gameplay-scoring function). Users' esINIT vests ~1/26 per epoch *if they stay engaged*, or they
  **zap it into the INIT:ZERO Enshrined-Liquidity** position.
- **Levers we control:** (1) drive INIT onto the rollup (make INIT useful in-game → Balance Pool),
  (2) design a retention-rewarding score, (3) win gauge votes, (4) set a sustainable commission.

---

## 7. Infra, cost, effort

- **Processes (24/7):** sequencer (`minitiad`), Executor, Challenger, IBC relayer, RPC/REST/indexer,
  resolver. ~a few mid-tier cloud VMs → **low-hundreds USD/month**, plus ongoing **INIT** (OPinit/output
  txs) and **TIA** if Celestia.
- **Liveness/security:** sequencer down → chain stalls; Executor down → bridging/finality stalls;
  Challenger defends correctness; keep the **Gas Station funded**.
- **Effort estimate:** contract port ≈ 1 day; testnet rollup bring-up + bots + bridge ≈ 1–2 weeks
  (mostly ops/learning Weave + OPinit); frontend/resolver repoint ≈ 1–2 days; VIP scoring contract +
  governance whitelisting ≈ governance-timeline-dependent (weeks, async).

---

## 8. Phased plan

- **Phase 0 — Port (local):** `initia_std`→`minitia_std`, rebuild, tests green.
- **Phase 1 — Testnet rollup:** `weave rollup launch` (Move/INIT-gas/Initia-DA/oracle), bots, relayer;
  deploy Move + `vip_score`; repoint a testnet frontend; smoke-test deposit/withdraw/Minitswap.
- **Phase 2 — Native integrations:** INIT:ZERO pool, Minitswap liquidity, registry listing, wallet/scan/oracle/usernames.
- **Phase 3 — Mainnet rollup:** relaunch on mainnet, register `mainnets/gridzero/`, cut frontend over.
- **Phase 4 — Governance:** VIP whitelisting + Enshrined-Liquidity whitelisting; publish the scoring fn; gauge-vote outreach.

---

## Sources
Weave: github.com/initia-labs/weave · MiniMove: github.com/initia-labs/minimove ·
stdlib diff: github.com/initia-labs/movevm (initia_stdlib vs minitia_stdlib) ·
OPinit: github.com/initia-labs/OPinit(-bots) · VIP: docs.initia.xyz/home/core-concepts/vip/architecture ·
Enshrined Liquidity: docs.initia.xyz/about/enshrined-liquidity-and-staking · Minitswap:
docs.initia.xyz/home/core-concepts/minitswap/architecture · Registry: github.com/initia-labs/initia-registry.
</content>

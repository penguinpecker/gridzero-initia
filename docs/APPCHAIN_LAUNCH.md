# gridZERO appchain (`gridzero-1`) — mainnet launch runbook

Launches gridZERO as its own **MiniMove rollup** on Initia mainnet via `weave`, runs the
OPinit bots + relayer, deploys the (already ported) Move package, and lists the chain.

> Contracts are **already MiniMove-ready** (Phase 0 done: `move/` uses `minitia_std`, tests
> pass). Gas station = the existing `gridzero-deployer` key (~85 INIT).

---

## 0. Provision the host (you do this; then give me SSH)

A persistent Linux VM that stays up 24/7 (the sequencer + bots run as services here):

- **Ubuntu 22.04**, ~**4 vCPU / 8 GB RAM / 160 GB SSD** (NVMe preferred).
- Open inbound: **26657** (RPC), **1317** (REST), **9090** (gRPC), **26656** (p2p). 443/80 if fronting with a domain.
- Provider: Hetzner / DigitalOcean / AWS — any.

Then give me **SSH access** (host + user + key), or run the commands below yourself via `!`.
Toolchain the runbook installs: Go ≥1.23, `lz4`, `weave` (`brew`/release), `minitiad` (weave fetches).

---

## 1. Install weave + gas station

```bash
# weave
curl -sSfL https://raw.githubusercontent.com/initia-labs/weave/main/ubuntu-script.sh | bash   # or brew install initia-labs/tap/weave
weave version

# import the gas station key (the deployer / admin+fee key, holds ~85 INIT)
weave init        # choose "import existing key" → paste the deployer key/mnemonic
```

The gas station funds OPinit/output L1 txs. Keep it topped up in INIT.

---

## 2. Launch config (`gridzero-1.config.json`)

Schema = weave `MinitiaConfig`. Starting template (final DA enum + periods confirmed on the box):

```json
{
  "l1_config": { "chain_id": "interwoven-1", "rpc_url": "https://rpc.initia.xyz", "gas_prices": "0.015uinit" },
  "l2_config": { "chain_id": "gridzero-1", "denom": "uinit", "moniker": "gridzero-sequencer" },
  "op_bridge": {
    "output_submission_interval": "1h0m0s",
    "output_finalization_period": "168h0m0s",
    "output_submission_start_height": 1,
    "batch_submission_target": "INITIA",
    "enable_oracle": true
  },
  "genesis_accounts": [
    { "address": "init1ujldjupk47tslx87ad2e84h3nwdu5xyex9rcdc", "coins": "1000000000uinit" }
  ]
}
```

Decisions baked in (per our choices):
- **VM = Move** (`--vm move`), **DA = Initia DA** (`batch_submission_target: "INITIA"` — most-native; `CELESTIA` if volume grows, needs TIA in the gas station). // VERIFY exact enum string on the box.
- **Gas denom = `uinit`** so the contract's `INIT_DENOM = b"uinit"` matches with **no code change**. (Bridged L1 INIT maps to the L2 gas token via the OP bridge.)
- `output_finalization_period` = **168h** = the 7-day withdrawal challenge window.
- `system_keys` omitted → **weave generates** the validator/executor/output-submitter/batch-submitter/challenger keys and funds them from the gas station/genesis.

```bash
weave rollup launch --vm move --with-config ./gridzero-1.config.json
```
This generates genesis/config/keys under `~/.minitia/`, **registers the rollup on L1 OPHost** (creates `bridge_id`, costs INIT), starts the sequencer service, and prints RPC/REST/gRPC + an InitiaScan link.

---

## 3. OPinit bots + relayer (the 24/7 crew)

```bash
weave opinit init        # configures executor + challenger from the launch artifacts
weave opinit start executor
weave opinit start challenger
weave relayer init       # IBC: transfer + nft-transfer channels (auto-consumes artifacts)
weave relayer start
```
Sequencer: `weave rollup start|stop|restart|log`. Executor folds in output-submitter + batch (DA) submitter; Challenger is fraud detection. **All must stay running.**

---

## 4. Deploy the Move package on `gridzero-1`

> **Pre-flight (audit MEDIUM) — verify the L2 INIT denom BEFORE publishing.** The contract
> uses `INIT_DENOM = b"uinit"` → `coin::denom_to_metadata("uinit")`. The game bricks
> (fail-closed, no fund loss) if the rollup's native gas token is registered under a
> different denom. Confirm it resolves:
> ```bash
> minitiad query bank denom-metadata --node http://localhost:26657 | grep -i uinit
> minitiad query move view 0x1 coin denom_to_metadata --args '["string:uinit"]' --node http://localhost:26657
> ```
> If genesis used a different denom (e.g. `l2/<hash>`), set `INIT_DENOM` in
> `move/sources/gridzero.move` to that exact string and rebuild — a one-constant change.

```bash
# build is already MiniMove (minitia_std); publish under the deployer on the rollup
minitiad move build --named-addresses gridzero=<deployer-hex>
minitiad tx move publish build/gridzero/bytecode_modules/zero_token.mv \
  build/gridzero/bytecode_modules/game.mv --upgrade-policy COMPATIBLE \
  --from gridzero-deployer --gas auto --gas-adjustment 1.4 --gas-prices 0.015uinit \
  --node http://localhost:26657 --chain-id gridzero-1 -y
# init_module auto-runs (escrow + $ZERO + round #1). Then set the fulfiller:
minitiad tx move execute <deployer-hex> game set_fulfiller --args "[\"address:<fulfiller-hex>\"]" --from gridzero-deployer ...
```

---

## 5. Repoint frontend + resolver (after launch, addresses known)

- Frontend `app/.env` + Vercel: `NEXT_PUBLIC_INITIA_CHAIN_ID=gridzero-1`,
  `NEXT_PUBLIC_INITIA_REST=<rollup REST>`, `NEXT_PUBLIC_INITIA_RPC=<rollup RPC>`,
  `NEXT_PUBLIC_GRIDZERO_ADDR=<deployer addr>`, `NEXT_PUBLIC_ZERO_METADATA=<new metadata>`.
  Wallet widget `chainId` → `gridzero-1`.
- Resolver (Railway) env: same `GRIDZERO_ADDR` + `INITIA_REST/RPC` → rollup endpoints.

---

## 6. Native integrations (post-launch, for the grant — see MINITIA_SCOPE.md)

- **initia-registry** PR: `mainnets/gridzero/{chain.json,assetlist.json,profile.json}` (`category: Gaming`, `l2: true`, `vip` block) → surfaces in Initia Wallet / Scan / Bridge / App hub.
- **INIT:ZERO Enshrined-Liquidity** pool on InitiaDEX (INIT weight ≥ 50%) → governance whitelist.
- **VIP**: deploy `vip_score` with the gameplay-scoring fn; governance whitelist for VIP eligibility.
- **Minitswap** liquidity for instant L2→L1 INIT exits.

---

## Ops notes
- Keep the **gas station funded** (INIT). Sequencer down → chain halts; Executor down → bridging/finality stalls.
- Back up `~/.minitia/` keys + the OPinit system keys.
- `weave rollup log` / `weave opinit log` for monitoring.
</content>

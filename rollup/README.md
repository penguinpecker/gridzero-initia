# gridZERO appchain (`gridzero-1`) on Railway — deployment

Hosts the MiniMove rollup as Railway services. **One step is unavoidably manual** — the
`weave` bootstrap is an interactive TUI (no scripted mode), so it must run once in a real
terminal. Everything after that is containerized on Railway.

## Architecture (4 Railway services)
| Service | Image | Notes |
|:--|:--|:--|
| **sequencer** | `Dockerfile.sequencer` (builds `minitiad` from minimove) | **+ Volume** at `/data/.minitia`; TCP-proxy **26657** (RPC) + **1317** (REST) public |
| **executor** | OPinit-bots image (`initia-labs/OPinit-bots` Dockerfile) | reaches sequencer (Railway internal URL) + L1 `rpc.initia.xyz` + DA |
| **challenger** | OPinit-bots image | fraud detection |
| **relayer** | hermes / initia relayer | IBC `transfer` + `nft-transfer`, L1 ↔ gridzero-1 |

(Single-sequencer MiniMove needs no p2p peers, so 26656 doesn't need exposing — fits Railway's one-public-port-per-service model.)

## Step 1 — Bootstrap (ONE TIME, in a terminal — `weave` is a TUI)
Run on any terminal (your Mac's Terminal.app is fine — it only generates config + does the L1 bridge registration; the node doesn't need to keep running here):
```bash
weave init                 # import the gridzero-deployer key as the gas station (holds ~85 INIT)
weave rollup launch --vm move --with-config /path/to/gridzero-1.config.json
# ^ generates ~/.minitia (genesis, config, keys) + registers the OP bridge on L1 (prints bridge_id)
weave rollup stop          # stop the local node; we run it on Railway instead
```
Config = `docs/APPCHAIN_LAUNCH.md` §2 (chain `gridzero-1`, gas denom `uinit`, Initia DA, oracle on, deployer funded at genesis).

## Step 2 — Seed the Railway volume
Create the **sequencer** service with a Volume mounted at `/data`, then one-time copy the bootstrapped node-home in:
```bash
tar czf minitia.tgz -C ~ .minitia
railway run --service sequencer 'mkdir -p /data && tar xzf - -C /data' < minitia.tgz   # or railway volume seed
```

## Step 3 — Deploy the services
- sequencer: deploy `Dockerfile.sequencer`; attach the volume; enable TCP proxy on 26657 + 1317.
- executor / challenger: deploy from the OPinit-bots image; set env from the bootstrap artifacts (`bridge_id`, L1 RPC, L2 RPC = sequencer internal URL, DA, keys).
- relayer: deploy; init with the L1/L2 channels.

## Step 4 — Publish the Move package on `gridzero-1`
After the sequencer RPC is live, **pre-flight the `uinit` denom** (audit MEDIUM — `docs/APPCHAIN_LAUNCH.md` §4), then publish `game` + `zero_token` and `set_fulfiller` (point at the gridzero-fulfiller key).

## Step 5 — Repoint frontend + resolver
- Frontend (Vercel env) + resolver (Railway env): `NEXT_PUBLIC_INITIA_CHAIN_ID=gridzero-1`,
  `..._REST`/`..._RPC` → the sequencer's Railway public RPC/REST, `GRIDZERO_ADDR` + `ZERO_METADATA` = the new deploy. Wallet widget `chainId: gridzero-1`.

## Post-launch (grant — see MINITIA_SCOPE.md)
initia-registry listing → VIP `vip_score` + governance whitelist → INIT:ZERO enshrined-liquidity pool → Minitswap liquidity.
</content>

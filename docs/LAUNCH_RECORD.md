# gridzero-1 launch record (Initia mainnet)

## Result — appchain LIVE
- **Launch:** 2026-05-28 17:55 IST (12:25 UTC) via `minitiad launch --with-config`
- **L1 chain:** `interwoven-1` @ height 17,599,800 (Initia mainnet)
- **L2 chain:** `gridzero-1` @ height 26 (bootstrapped, idle until sequencer starts)
- **Bridge ID:** `47` (registered on L1 OPHost)
- **Bridge L1 contract:** `init1rlrcdw6qmz6hyscun2t7czcvhwssx78dnrt333lhyz9cmze3wh9sx9qnu9`
- **DA:** Initia DA (no Celestia/TIA dependency)
- **Oracle:** enabled
- **Submission interval / finalization:** 1h / 7d

## IBC channels (gridzero-1 ↔ interwoven-1)
| port | gridzero-1 channel | interwoven-1 channel | use |
|:--|:--|:--|:--|
| `transfer` | `channel-0` | `channel-110` | INIT + IBC tokens |
| `nft-transfer` | `channel-1` | `channel-111` | ICS-721 NFTs |

## OPinit roles (key-type: secp256k1, coin-type 118 — matches launcher derivation)
| role | L1 address | funded |
|:--|:--|--:|
| Validator (L2 only) | `init17uep3eutpvmqagl3l8g5fzk7p3ayne2nvtcaap` | – |
| BridgeExecutor | `init1egjtr52u25cyuulph34e02mgtntjxnrwrvpfc6` | 30 INIT |
| OutputSubmitter | `init1tmtjagw5r8zg0kgl3vzukkr2ack3vnrdqgjg78` | 5 INIT |
| BatchSubmitter | `init1qtm2akzgefqxk8smjaj49x5d34vey3a2ttdtd7` | 5 INIT |
| Challenger | `init1yumu4xcpxkwncu620a8pr65sskl7h0wpuacrq6` | 2 INIT |

Mnemonics stored in `.secrets/gridzero-1.launch.json` (gitignored).

## L1 setup tx hashes (interwoven-1)
- IBC client create: `CC45CA97198368B18AA1AB3E3FCBEB5CE215BEFF5B62876FE0E178A513E32F16`
- IBC channel handshake (transfer/nft-transfer): `83303E…E95B8F`, `21A34B…B27A2D`
- Bridge create (MsgCreateBridge, bridge_id 47): `7E5AC3A8A16247738DDDF8E504ED1C19C1CF4605275846413DCF847E17D5230A`
- Bridge create cost: ~0.035 INIT (gas only — no separate creation fee charged)
- Total deployer spend: 42 INIT funding + ~0.04 INIT tx fees → remaining 39.23 INIT

## Bootstrapped artifacts
- `/tmp/gz-minitia/{config,keyring-test,data}` — full node home (data/ regenerates on first start)
- `.secrets/launch/gridzero-1-node-home.tgz` — 118 KB tarball of config + keyring (no data/)
- `.secrets/launch/{artifacts.json,config.json}` — launcher outputs

## Issues resolved during launch
1. **Key derivation mismatch** — `minitiad keys add` defaults to `eth_secp256k1 + coin-type 60` (Ethereum-style, Initia's L1 default), but the OPinit launcher's keyring-import code uses cosmos-standard `secp256k1 + coin-type 118`. Fix: regenerate the 5 system keys with `--key-type secp256k1 --coin-type 118`.
2. **L1 RPC URL parse error** — relayer requires explicit port; `https://rpc.initia.xyz` fails Go's `net.SplitHostPort`. Fix: use `https://rpc.initia.xyz:443`.
3. **OPinit accounts not on L1** — bridge_executor needed L1 account record before signing `MsgCreateClient`. Fix: pre-fund all 4 active roles from the deployer (42 INIT total, validator not used on L1).

## Next steps
- Ship node-home tarball to Railway sequencer volume; start sequencer service.
- Deploy executor + challenger + relayer to Railway pointing at `bridge_id=47`.
- Publish Move package (gridzero + zero_token) on gridzero-1; set fulfiller.
- Repoint Vercel frontend + resolver env to gridzero-1 RPC.
- Submit initia-registry PR (`mainnets/gridzero/chain.json`) — grant alignment.
- Request VIP whitelisting + INIT:ZERO enshrined-liquidity pool.

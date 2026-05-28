// gridzero-1 chain config passed to @initia/react-wallet-widget as `customLayer`.
//
// The wallet widget normally fetches chain metadata from initia-registry by
// chain_id. gridzero-1 isn't merged in the registry yet (PR pending), so the
// lookup returns undefined and the widget crashes with:
//   TypeError: Cannot read properties of undefined (reading 'metadata')   (connectWallet)
//   TypeError: Cannot read properties of undefined (reading 'chain_id')  (requestInitiaTx)
//
// Passing the chain object inline via `customLayer` short-circuits that lookup.
// The shape is the @initia/initia-registry-types `Chain` interface — this is the
// same JSON we submitted to initia-labs/initia-registry#835, ported to JS object.
//
// When the registry PR merges this file can be deleted and the Provider can
// fall back to the default registry lookup; until then, this is the source of
// truth for the appchain in the frontend.

import { CHAIN_ID, RPC_URL, REST_URL } from "./initia";

export const GRIDZERO_LAYER = {
  $schema: "../../chain.schema.json",
  chain_name: "gridzero",
  pretty_name: "gridZERO",
  chain_id: CHAIN_ID,
  website: "https://gridzero-initia.vercel.app",
  description:
    "On-chain 5x5 lottery game on Initia. Pick a cell, the round resolves a winner from occupied cells every 60s.",
  bech32_prefix: "init",
  network_type: "mainnet",
  codebase: {
    git_repo: "https://github.com/initia-labs/minimove",
    recommended_version: "v1.1.12",
    binaries: {},
    genesis: {
      genesis_url: `${RPC_URL}/genesis`,
    },
  },
  apis: {
    rpc: [{ address: RPC_URL }],
    rest: [{ address: REST_URL }],
  },
  key_algos: ["initia_ethsecp256k1", "secp256k1"],
  slip44: 60,
  fees: {
    fee_tokens: [{ denom: "uinit", fixed_min_gas_price: 0 }],
  },
  explorers: [
    {
      kind: "initia scan",
      url: `https://scan.initia.xyz/${CHAIN_ID}`,
      tx_page: `https://scan.initia.xyz/${CHAIN_ID}/txs/\${txHash}`,
      account_page: `https://scan.initia.xyz/${CHAIN_ID}/accounts/\${accountAddress}`,
    },
  ],
  images: [
    {
      png: "https://raw.githubusercontent.com/initia-labs/initia-registry/main/images/gridzero.png",
    },
  ],
  logo_URIs: {
    png: "https://raw.githubusercontent.com/initia-labs/initia-registry/main/images/gridzero.png",
  },
  metadata: {
    op_bridge_id: "47",
    op_denoms: ["uinit"],
    ibc_channels: [
      {
        chain_id: "interwoven-1",
        port_id: "nft-transfer",
        channel_id: "channel-1",
        version: "ics721-1",
      },
      {
        chain_id: "interwoven-1",
        port_id: "transfer",
        channel_id: "channel-0",
        version: "ics20-1",
      },
    ],
    minitia: { type: "minimove", version: "v1.1.12" },
  },
};

// Tiny URL helpers used across components — Initia Scan uses PLURAL paths
// (`/txs/...`, `/accounts/...`), not the singular forms (`/tx/`, `/account/`)
// our older copy of the frontend was using.
export const explorerTxUrl = (hash) =>
  `https://scan.initia.xyz/${CHAIN_ID}/txs/${hash}`;

export const explorerAccountUrl = (addr) =>
  `https://scan.initia.xyz/${CHAIN_ID}/accounts/${addr}`;

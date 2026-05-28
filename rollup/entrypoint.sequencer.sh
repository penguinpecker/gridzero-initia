#!/usr/bin/env bash
# gridZERO sequencer entrypoint (Railway). Auto-restores the bootstrapped
# node-home into the mounted volume on first start, then runs the chain.
set -euo pipefail
: "${MINITIA_HOME:=/data/.minitia}"
SEED=/seed/gridzero-1-node-home.tgz

# Use a more specific marker than config/genesis.json: priv_validator_state.json
# is in data/ which was missing from the first seed shipment. --skip-old-files
# preserves anything already in the volume but fills in anything missing.
if [ ! -f "$MINITIA_HOME/data/priv_validator_state.json" ]; then
  if [ ! -f "$SEED" ]; then
    echo "[fatal] no priv_validator_state at $MINITIA_HOME/data AND no seed at $SEED"
    exit 1
  fi
  echo "[init] seeding missing files into $MINITIA_HOME from $SEED"
  mkdir -p "$MINITIA_HOME"
  tar xzf "$SEED" -C "$MINITIA_HOME" --skip-old-files
  echo "[init] seed complete"
fi

# Bind RPC/REST/gRPC to 0.0.0.0 so Railway's TCP proxy + the bots/frontend can reach it.
# --minimum-gas-prices 0uinit so sequencer accepts free user txs (chain still works without paid gas);
# bots that pay gas will set their own --gas-prices.
exec minitiad start --home "$MINITIA_HOME" \
  --rpc.laddr tcp://0.0.0.0:26657 \
  --api.enable --api.address tcp://0.0.0.0:1317 \
  --grpc.enable --grpc.address 0.0.0.0:9090 \
  --minimum-gas-prices "0uinit"

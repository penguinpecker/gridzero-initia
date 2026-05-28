#!/usr/bin/env bash
# gridZERO OPinit executor entrypoint (Railway).
# Always regenerates executor.json from env (config is derived, not stored);
# keys + DBs stay on the persistent volume across restarts.
set -euo pipefail
: "${OPINIT_HOME:=/data/.opinit}"
mkdir -p "$OPINIT_HOME"

# Required env (set in Railway):
#   BRIDGE_EXECUTOR_MNEMONIC, OUTPUT_SUBMITTER_MNEMONIC, BATCH_SUBMITTER_MNEMONIC
#   L1_RPC (use https:// for TLS; tcp:// is plain HTTP), L2_RPC
#   BRIDGE_ID, L1_CHAIN_ID, L2_CHAIN_ID
for v in BRIDGE_EXECUTOR_MNEMONIC OUTPUT_SUBMITTER_MNEMONIC BATCH_SUBMITTER_MNEMONIC L1_RPC L2_RPC BRIDGE_ID L1_CHAIN_ID L2_CHAIN_ID; do
  if [ -z "${!v:-}" ]; then echo "[fatal] required env $v not set"; exit 1; fi
done

CFG="$OPINIT_HOME/executor.json"

# Always regenerate config — env is the source of truth.
rm -f "$CFG"
opinitd init executor --home "$OPINIT_HOME" >/dev/null

python3 -c "
import json, os
c = json.load(open('$CFG'))
c['l1_node']['chain_id'] = '$L1_CHAIN_ID'
c['l1_node']['rpc_address'] = '$L1_RPC'
c['l1_node']['gas_price'] = '0.015uinit'
c['l2_node']['chain_id'] = '$L2_CHAIN_ID'
c['l2_node']['rpc_address'] = '$L2_RPC'
c['l2_node']['gas_price'] = '0uinit'
c['da_node']['chain_id'] = '$L1_CHAIN_ID'
c['da_node']['rpc_address'] = '$L1_RPC'
c['da_node']['gas_price'] = '0.015uinit'
c['bridge_executor'] = 'bridge_executor'
c['oracle_relay']['enable'] = False
c['server']['address'] = '0.0.0.0:' + os.environ.get('PORT', '3000')
json.dump(c, open('$CFG','w'), indent=2)
print('[init] config written  l1=' + c['l1_node']['rpc_address'] + '  l2=' + c['l2_node']['rpc_address'])
"

# Register keys — idempotent
echo "[init] registering keys (idempotent — 'already exists' errors are expected on restart)"
for entry in \
  "$L1_CHAIN_ID|bridge_executor|$BRIDGE_EXECUTOR_MNEMONIC" \
  "$L1_CHAIN_ID|output_submitter|$OUTPUT_SUBMITTER_MNEMONIC" \
  "$L1_CHAIN_ID|batch_submitter|$BATCH_SUBMITTER_MNEMONIC" \
  "$L2_CHAIN_ID|bridge_executor|$BRIDGE_EXECUTOR_MNEMONIC"; do
  IFS='|' read -r CHAIN NAME MN <<< "$entry"
  opinitd keys add "$CHAIN" "$NAME" --recover --mnemonic "$MN" \
    --key-type secp256k1 --coin-type 118 --home "$OPINIT_HOME" >/dev/null 2>&1 || true
done

echo "[init] keys on $L1_CHAIN_ID:"
opinitd keys list "$L1_CHAIN_ID" --home "$OPINIT_HOME" 2>&1 || true
echo "[init] keys on $L2_CHAIN_ID:"
opinitd keys list "$L2_CHAIN_ID" --home "$OPINIT_HOME" 2>&1 || true

exec opinitd start executor --home "$OPINIT_HOME"

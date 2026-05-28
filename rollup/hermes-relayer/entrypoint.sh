#!/usr/bin/env bash
# Hermes relayer for gridzero-1 <-> interwoven-1.
# Generates config + key files from env each start (keys/data persist on volume).
set -euo pipefail
: "${HERMES_HOME:=/data/.hermes}"
mkdir -p "$HERMES_HOME"

for v in BRIDGE_EXECUTOR_MNEMONIC L1_RPC L1_GRPC L2_RPC L2_GRPC L1_CHAIN_ID L2_CHAIN_ID; do
  if [ -z "${!v:-}" ]; then echo "[fatal] required env $v not set"; exit 1; fi
done

CFG="$HERMES_HOME/config.toml"
cat > "$CFG" <<EOF
[global]
log_level = 'info'

[mode.clients]
enabled = true
refresh = true
misbehaviour = false

[mode.connections]
enabled = true

[mode.channels]
enabled = true

[mode.packets]
enabled = true
clear_interval = 100
clear_on_start = true
tx_confirmation = true

[rest]
enabled = true
host = '0.0.0.0'
port = ${PORT:-3000}

[telemetry]
enabled = false
host = '127.0.0.1'
port = 3001

[[chains]]
id = '$L1_CHAIN_ID'
type = 'CosmosSdk'
rpc_addr = '$L1_RPC'
grpc_addr = '$L1_GRPC'
event_source = { mode = 'push', url = 'wss://rpc.initia.xyz/websocket', batch_delay = '500ms' }
rpc_timeout = '15s'
account_prefix = 'init'
key_name = 'relayer'
store_prefix = 'ibc'
default_gas = 200000
max_gas = 5000000
gas_multiplier = 1.5
gas_price = { price = 0.015, denom = 'uinit' }
max_msg_num = 30
max_tx_size = 180000
clock_drift = '30s'
max_block_time = '30s'
trusting_period = '14days'
trust_threshold = { numerator = '1', denominator = '3' }

[[chains]]
id = '$L2_CHAIN_ID'
type = 'CosmosSdk'
rpc_addr = '$L2_RPC'
grpc_addr = '$L2_GRPC'
event_source = { mode = 'push', url = '${L2_RPC_WS:-ws://gridzero-sequencer.railway.internal:26657/websocket}', batch_delay = '500ms' }
rpc_timeout = '15s'
account_prefix = 'init'
key_name = 'relayer'
store_prefix = 'ibc'
default_gas = 200000
max_gas = 5000000
gas_multiplier = 1.5
gas_price = { price = 0, denom = 'uinit' }
max_msg_num = 30
max_tx_size = 180000
clock_drift = '30s'
max_block_time = '30s'
trusting_period = '5days'
trust_threshold = { numerator = '1', denominator = '3' }
EOF
echo "[init] config.toml written"

# Import the bridge_executor mnemonic as 'relayer' on both chains
MN_FILE=$(mktemp)
echo "$BRIDGE_EXECUTOR_MNEMONIC" > "$MN_FILE"
hermes --config "$CFG" keys add --chain "$L1_CHAIN_ID" --mnemonic-file "$MN_FILE" --key-name relayer --hd-path "m/44'/118'/0'/0/0" 2>&1 | tail -3 || true
hermes --config "$CFG" keys add --chain "$L2_CHAIN_ID" --mnemonic-file "$MN_FILE" --key-name relayer --hd-path "m/44'/118'/0'/0/0" 2>&1 | tail -3 || true
rm -f "$MN_FILE"

echo "[init] keys imported"
hermes --config "$CFG" keys list --chain "$L1_CHAIN_ID" 2>&1 | tail -3 || true
hermes --config "$CFG" keys list --chain "$L2_CHAIN_ID" 2>&1 | tail -3 || true

exec hermes --config "$CFG" start

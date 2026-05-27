#!/usr/bin/env bash
#
# deploy.sh — build, publish, and wire up the gridZERO Move package on
# Initia mainnet (interwoven-1).
#
# This wraps the flow documented in docs/DEPLOY.md:
#   1. initiad move build      (compile with gridzero=<addr>)
#   2. initiad move deploy      (publish; init_module auto-creates the escrow
#                                + opens round #1)
#   3. game set_fulfiller       (point the game at the resolver wallet)
#
# REQUIREMENTS
#   * initiad CLI on PATH.
#   * A FUNDED init1… deployer key in the local keyring, holding INIT for gas.
#     The package publishes UNDER this account, so GRIDZERO_ADDR must be this
#     deployer's bech32 address.
#
# This script does NOT run itself anywhere — invoke it manually once the env
# vars below are set, and read docs/DEPLOY.md first.
#
# ENV VARS (required)
#   GRIDZERO_DEPLOYER_KEY  keyring NAME of the funded deployer key
#                          (e.g. "gridzero-deployer"), passed to --from
#   GRIDZERO_ADDR          the gridzero named address == deployer bech32 addr
#                          (e.g. init1...)
#   FULFILLER_ADDR         the resolver bot wallet that may call resolve_round
#
# ENV VARS (optional, with defaults)
#   CHAIN_ID               default: interwoven-1
#   NODE                   tx broadcast RPC, default: https://rpc.initia.xyz
#   REST                   query endpoint,   default: https://rest.initia.xyz
#   MOVE_PATH              package dir,       default: ./move
#   UPGRADE_POLICY         default: COMPATIBLE  (or IMMUTABLE to lock code)
#   GAS_PRICES             default: 0.015uinit
#
# USAGE
#   export GRIDZERO_DEPLOYER_KEY=gridzero-deployer
#   export GRIDZERO_ADDR=init1youraddress...
#   export FULFILLER_ADDR=init1resolverwallet...
#   ./scripts/deploy.sh

set -euo pipefail

# ----- config -----
CHAIN_ID="${CHAIN_ID:-interwoven-1}"
NODE="${NODE:-https://rpc.initia.xyz}"
REST="${REST:-https://rest.initia.xyz}"
MOVE_PATH="${MOVE_PATH:-./move}"
UPGRADE_POLICY="${UPGRADE_POLICY:-COMPATIBLE}"
GAS_PRICES="${GAS_PRICES:-0.015uinit}"

# common tx flags
TX_FLAGS=(
  --from "${GRIDZERO_DEPLOYER_KEY:-}"
  --gas auto --gas-adjustment 1.5
  --gas-prices "${GAS_PRICES}"
  --node "${NODE}"
  --chain-id "${CHAIN_ID}"
)

# ----- preflight -----
require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: required env var ${name} is not set. See header of this script." >&2
    exit 1
  fi
}

echo "==> [0/3] Preflight checks"
command -v initiad >/dev/null 2>&1 || { echo "ERROR: initiad not found on PATH." >&2; exit 1; }
require GRIDZERO_DEPLOYER_KEY
require GRIDZERO_ADDR
require FULFILLER_ADDR
echo "    deployer key : ${GRIDZERO_DEPLOYER_KEY}"
echo "    gridzero addr: ${GRIDZERO_ADDR}"
echo "    fulfiller    : ${FULFILLER_ADDR}"
echo "    chain        : ${CHAIN_ID} via ${NODE}"
echo "    move package : ${MOVE_PATH}  (upgrade-policy ${UPGRADE_POLICY})"
echo

# ----- 1. build -----
echo "==> [1/3] Building Move package (gridzero=${GRIDZERO_ADDR})"
initiad move build \
  --path "${MOVE_PATH}" \
  --named-addresses "gridzero=${GRIDZERO_ADDR}"
echo

# ----- 2. publish -----
# init_module runs automatically on publish: creates the $ZERO asset + the
# escrow object, seeds default config, and opens round #1.
echo "==> [2/3] Publishing package to ${CHAIN_ID}"
initiad move deploy \
  --path "${MOVE_PATH}" \
  --named-addresses "gridzero=${GRIDZERO_ADDR}" \
  --upgrade-policy "${UPGRADE_POLICY}" \
  "${TX_FLAGS[@]}"
echo

# ----- 3. set fulfiller -----
echo "==> [3/3] Setting fulfiller to ${FULFILLER_ADDR}"
initiad tx move execute \
  "${GRIDZERO_ADDR}" game set_fulfiller \
  --args "[\"address:${FULFILLER_ADDR}\"]" \
  "${TX_FLAGS[@]}"
echo

echo "==> Done."
echo "    Verify round #1 is open:"
echo "      initiad query move view ${GRIDZERO_ADDR} game get_current_round --node ${REST}"
echo "    Verify config + fulfiller:"
echo "      initiad query move view ${GRIDZERO_ADDR} game get_config --node ${REST}"
echo
echo "    Next: fund the escrow for Motherlode payouts, e.g. 500 INIT:"
echo "      initiad tx move execute ${GRIDZERO_ADDR} game fund_treasury \\"
echo "        --args '[\"u64:500000000\"]' --from ${GRIDZERO_DEPLOYER_KEY} \\"
echo "        --gas auto --gas-adjustment 1.5 --gas-prices ${GAS_PRICES} \\"
echo "        --node ${NODE} --chain-id ${CHAIN_ID}"
echo "    (see docs/DEPLOY.md for the full post-deploy checklist)"

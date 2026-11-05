#!/usr/bin/env bash
# Build and deploy FlowPulse contracts to Stellar testnet.
# Usage: ./scripts/deploy-testnet.sh [identity]   (default identity: flowpulse-deployer)
set -euo pipefail
ID="${1:-flowpulse-deployer}"
RPC="https://soroban-testnet.stellar.org"
PASS="Test SDF Network ; September 2015"
cd "$(dirname "$0")/../contracts"

if ! stellar keys address "$ID" >/dev/null 2>&1; then
  echo "→ creating and funding identity $ID"
  stellar keys generate "$ID" --network testnet --fund
fi

echo "→ building contracts"
stellar contract build

deploy() {
  local wasm="target/wasm32v1-none/release/$1.wasm"
  for i in 1 2 3 4 5; do
    if out=$(stellar contract deploy --wasm "$wasm" --source "$ID" --rpc-url "$RPC" --network-passphrase "$PASS" 2>&1); then
      echo "$out" | tail -1
      return
    fi
    echo "  retry $i: $(echo "$out" | tail -1)" >&2
    sleep 4
  done
  echo "deploy of $1 failed" >&2
  exit 1
}

ROUTER=$(deploy stream_router)
SPLITTER=$(deploy cascade_splitter)

cat <<OUT

Deployed. Add to frontend/.env.local:

VITE_STREAM_ROUTER_ID=$ROUTER
VITE_CASCADE_SPLITTER_ID=$SPLITTER
VITE_READ_SOURCE=$(stellar keys address "$ID")
OUT

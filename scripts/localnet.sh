#!/usr/bin/env bash
# THE PROGRAM ON A LOCAL VALIDATOR — the devnet build, with Pyth's SOL/USD and USDC/USD
# accounts cloned from devnet at start, so the on-chain battery runs without devnet SOL.
#
#     scripts/localnet.sh start     # boots, funds the deployer key, prints the RPC
#     scripts/localnet.sh test      # runs the battery against it
#     scripts/localnet.sh stop
#
# The cloned price is a snapshot: the program refuses a price older than ten minutes, so run
# the battery within ten minutes of `start` (or `restart`).
set -euo pipefail
S="${SOLANA_BIN:-$HOME/.local/share/solana/install/active_release/bin}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER="${SCRIP_LEDGER:-/tmp/scrip-localnet}"
PROGRAM_ID="Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj"
SO="$ROOT/anchor/target/deploy/scrip-devnet.so"
KEY="$ROOT/anchor/.keys/deployer.json"
RPC="http://127.0.0.1:8899"
SOL_USD="7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
USDC_USD="Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"
MEMO="MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"

start() {
  [ -f "$SO" ] || { echo "build first: npm run anchor:build:devnet"; exit 1; }
  pkill -f "solana-test-validator" 2>/dev/null || true
  rm -rf "$LEDGER"
  nohup "$S/solana-test-validator" --reset --quiet --ledger "$LEDGER" \
    --bpf-program "$PROGRAM_ID" "$SO" \
    --clone "$SOL_USD" --clone "$USDC_USD" --clone "$MEMO" --url https://api.devnet.solana.com \
    > "$LEDGER.log" 2>&1 &
  for i in $(seq 1 60); do
    if "$S/solana" cluster-version -u "$RPC" >/dev/null 2>&1; then break; fi
    sleep 1
  done
  "$S/solana" airdrop 100 "$("$S/solana" address -k "$KEY")" -u "$RPC" >/dev/null
  echo "localnet up at $RPC; deployer funded; price cloned at $(date -u +%H:%M:%SZ)"
}

case "${1:-}" in
  start) start ;;
  restart) start ;;
  stop) pkill -f "solana-test-validator" 2>/dev/null || true; echo "stopped" ;;
  test) cd "$ROOT" && DEVNET_E2E=1 DEVNET_RPC="$RPC" npx vitest run tests/devnet.e2e.test.ts ;;
  *) echo "usage: scripts/localnet.sh start|restart|test|stop"; exit 2 ;;
esac

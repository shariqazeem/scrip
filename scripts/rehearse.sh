#!/usr/bin/env bash
# THE MAINNET BRING-UP, REHEARSED AND TIMED.
#
# The same sequence `docs/deploy.md` gives for mainnet, run end to end against a local
# validator so it costs nothing and can be repeated: deploy, open the organisation's
# register with the rule on, land money, sweep it, index, publish, then every money path
# the battery covers — a payment, a gift claimed from an empty wallet, a grant, a vest —
# and finally the production build. Every step is timed and the total is printed.
#
#     scripts/rehearse.sh
#
# What differs on mainnet: the mints are the registry's real ones instead of stand-ins, the
# route is Jupiter instead of a transfer from the keeper's stash, and the price is the real
# SPYX/USD feed instead of the cloned SOL/USD. The commands and their order do not differ.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export NEXT_PUBLIC_SOLANA_RPC="http://127.0.0.1:8899"
export DEVNET_RPC="http://127.0.0.1:8899"
export SCRIP_DB_PATH="var/scrip.rehearsal.db"
export NEXT_PUBLIC_DEVNET_USDC_MINT=""
export DEMO_SLUG="${DEMO_SLUG:-scrip}"
export DEMO_KIND=org
# Its own state file: a rehearsal must never touch the keys of a cluster that is live.
export DEMO_STATE="$ROOT/anchor/.keys/rehearsal.json"
export DEVNET_E2E=1
# `server-only` throws outside a server bundle, so the tsx scripts that import app modules
# run under the react-server condition. vitest and `next build` must NOT: they need the
# client condition for React. So it is set per step, never globally.
SERVER_ONLY="--conditions=react-server"

STEPS=()
TIMES=()
FAILED=0

# step "name" [--server] command…
step() {
  local name="$1"; shift
  local opts=""
  if [ "${1:-}" = "--server" ]; then opts="$SERVER_ONLY"; shift; fi
  local at=$SECONDS
  printf '\n──  %s\n' "$name"
  if NODE_OPTIONS="$opts" "$@" > "/tmp/rehearse-step.log" 2>&1; then
    local took=$((SECONDS - at))
    tail -3 /tmp/rehearse-step.log | sed 's/^/    /'
    printf '    ✓ %ss\n' "$took"
    STEPS+=("$name"); TIMES+=("$took")
  else
    local took=$((SECONDS - at))
    tail -12 /tmp/rehearse-step.log | sed 's/^/    /'
    printf '    ✗ FAILED after %ss\n' "$took"
    STEPS+=("$name (FAILED)"); TIMES+=("$took")
    FAILED=1
  fi
}

START=$SECONDS
rm -f var/scrip.rehearsal.db var/scrip.rehearsal.db-shm var/scrip.rehearsal.db-wal
rm -f anchor/.keys/rehearsal.json

step "a validator, and the program deployed onto it" scripts/localnet.sh start
step "what a deploy would cost, and what is missing" --server npx tsx scripts/preflight.ts
step "the organisation's register, rule on, one signature" --server npx tsx scripts/devnet-demo.ts setup
step "money lands"                             --server npx tsx scripts/devnet-demo.ts land 200
step "the keeper sweeps it"                    --server npx tsx scripts/devnet-demo.ts sweep
step "index what the chain now holds"          --server npx tsx scripts/index-once.ts --skip-watcher
step "publish the page"                        --server npx tsx scripts/book.ts publish --slug "$DEMO_SLUG"
step "every money path, on chain"              npx vitest run tests/devnet.e2e.test.ts
step "the production build"                    npm run build

TOTAL=$((SECONDS - START))
printf '\n────────────────────────────────────────────────────────────\n'
for i in "${!STEPS[@]}"; do printf '%6ss  %s\n' "${TIMES[$i]}" "${STEPS[$i]}"; done
printf '────────────────────────────────────────────────────────────\n'
printf '%6ss  in all%s\n\n' "$TOTAL" "$([ $FAILED -eq 1 ] && echo ' — WITH FAILURES' || echo '')"
exit $FAILED

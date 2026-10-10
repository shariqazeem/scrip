#!/usr/bin/env bash
# SCRIP CURVE, REHEARSED END TO END — on a local validator holding Meteora's mainnet programs
# (DBC, DAMM v2), Metaplex, Token-2022, the Nasdaq 100 and Tesla mints and Meteora's token badges
# for each, with the Scrip program's devnet build at its real id. Throwaway keys; nothing touches
# mainnet but reads. Launches, buys and sales are built by the same code scrip.work uses
# (src/lib/curve/build.ts, through scripts/curve.ts), so this rehearses what a wallet signs:
#
#   every Plan and config in two stocks → a saver invited → a demonstration launch in the Nasdaq
#   100 and a public launch in Tesla, each with a first buy → a buy at the opening fee → a sale back
#   into the curve for the stock → the fees, straight into each stock's Plan → a buy that fills the
#   demonstration curve → graduation to DAMM v2 → the graduation fee into the Plan → a trade on the
#   graduated pool → its fee into the Plan.
#
#     npm run curve:rehearse
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
S="${SOLANA_BIN:-$HOME/.local/share/solana/install/active_release/bin}"
WORK="$(mktemp -d)"
export SOLANA_MAINNET_RPC="http://127.0.0.1:8899"
export CURVE_DEPLOYED="$WORK/deployed.json"
for k in operator claimer sponsor saver; do "$S/solana-keygen" new --no-bip39-passphrase --silent -o "$WORK/$k.json"; done
pub() { "$S/solana-keygen" pubkey "$WORK/$1.json"; }
FAILED=0
step() {
  local name="$1"; shift
  printf '\n──  %s\n' "$name"
  if "$@" > "$WORK/step.log" 2>&1; then grep -v '^Program \|^signing as' "$WORK/step.log" | tail -3 | sed 's/^/    /'; printf '    ✓\n'
  else tail -8 "$WORK/step.log" | sed 's/^/    /'; printf '    ✗ FAILED\n'; FAILED=1; fi
}
cli() { npx tsx --conditions=react-server scripts/curve.ts "$@"; }
launch() { python3 -c "import json;print(json.load(open('$CURVE_DEPLOYED'))['launches'][$1].get('$2',''))"; }

step "a local validator with Meteora's mainnet programs, in two stocks" scripts/curve-localnet.sh start "$(pub operator)"
for k in claimer sponsor; do "$S/solana" airdrop 10 "$(pub $k)" -u "$SOLANA_MAINNET_RPC" >/dev/null; done
# Meteora's DBC pool authority pays a graduation's rent; on mainnet it holds tens of SOL.
"$S/solana" airdrop 50 FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM -u "$SOLANA_MAINNET_RPC" >/dev/null
printf '{"cluster":"localnet","feeClaimer":"%s","plans":{},"configs":{},"launches":[],"lookupTable":null}\n' "$(pub claimer)" > "$CURVE_DEPLOYED"

step "every Plan and config, Nasdaq 100 and Tesla"   cli setup --keypair "$WORK/sponsor.json" --stocks QQQx,TSLAx --demonstration QQQx
step "a saver invited to the Nasdaq 100 Plan"        cli plan-invite --keypair "$WORK/sponsor.json" --stock QQQx --members "$(pub saver)"
step "a demonstration launch in the Nasdaq 100"      cli launch --keypair "$WORK/operator.json" --stock QQQx --kind demonstration --name "Savings Demonstration One" --symbol DEMO1 --first-buy-quote 0.006
step "a public launch in Tesla"                      cli launch --keypair "$WORK/operator.json" --stock TSLAx --kind public --name "Rehearsal Two" --symbol TWO --first-buy-quote 0.02
POOL="$(launch 0 pool)"
POOL2="$(launch 1 pool)"
step "a buy at the opening fee"                      cli buy --keypair "$WORK/operator.json" --pool "$POOL" --quote 0.01
step "a sale back into the curve, for Tesla"         cli sell --keypair "$WORK/operator.json" --pool "$POOL2" --all
step "a buy in Tesla"                                cli buy --keypair "$WORK/operator.json" --pool "$POOL2" --quote 0.05
step "the fees, straight into each stock's Plan"     cli fees --keypair "$WORK/claimer.json"
step "a buy that fills the demonstration curve"      cli buy --keypair "$WORK/operator.json" --pool "$POOL" --quote 0.06
step "graduation to DAMM v2"                         cli migrate --keypair "$WORK/operator.json" --pool "$POOL"
step "the last curve fee and the graduation fee"     cli fees --keypair "$WORK/claimer.json"
step "a trade on the graduated pool"                 npx tsx scripts/curve-localnet-trade.ts "$WORK/operator.json" "$(launch 0 dammPool)" 0.01
step "the graduated pool's fee into the Plan"        cli fees --keypair "$WORK/claimer.json"
step "where everything stands"                       cli status
# KEEP=1 leaves the validator running and the record in place, to read it from the page's own code.
if [ "${KEEP:-0}" = "1" ]; then printf '\nkept: validator on :8899, record at %s\n' "$CURVE_DEPLOYED"; else scripts/curve-localnet.sh stop >/dev/null; fi
printf '\n%s\n' "$([ $FAILED -eq 1 ] && echo 'REHEARSAL FAILED' || echo 'Scrip Curve, rehearsed end to end in two stocks: every fee is in its Plan.')"
exit $FAILED

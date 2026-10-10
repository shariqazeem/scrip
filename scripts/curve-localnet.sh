#!/usr/bin/env bash
# SCRIP CURVE ON A LOCAL VALIDATOR — Meteora's mainnet programs (DBC, DAMM v2), Metaplex and
# Token-2022 dumped from mainnet; the Nasdaq 100 and Tesla mints and Meteora's two token badges for
# each cloned; the Scrip program's devnet build loaded at its real id (for the Plans); and an
# account in each stock made for a throwaway payer. Nothing here touches mainnet but reads.
#
#     scripts/curve-localnet.sh start <payer address>     # boots it on :8899
#     scripts/curve-localnet.sh stop
set -euo pipefail
S="${SOLANA_BIN:-$HOME/.local/share/solana/install/active_release/bin}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER="${CURVE_LEDGER:-/tmp/scrip-curve-localnet}"
DUMPS="${CURVE_DUMPS:-/tmp/scrip-curve-dumps}"
MAIN="$(grep '^NEXT_PUBLIC_SOLANA_RPC=' "$ROOT/.env.local" | cut -d= -f2- | tr -d '"')"
DBC=dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
DAMM=cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
META=metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s
T22=TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb
SCRIP=Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj
QQQX=Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ
TSLAX=XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB
DAMM_CONFIG=A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck

start() {
  local payer="$1"
  mkdir -p "$DUMPS"
  for p in $DBC $DAMM $META $T22; do
    [ -s "$DUMPS/$p.so" ] || "$S/solana" program dump -u "$MAIN" "$p" "$DUMPS/$p.so" >/dev/null
  done
  # An account in each stock for the payer: a real holder's account, its owner and amount rewritten.
  (cd "$ROOT" && npx tsx scripts/curve-localnet-account.ts "$payer" "$DUMPS/payer-qqqx.json" 1 $QQQX) >/dev/null
  (cd "$ROOT" && npx tsx scripts/curve-localnet-account.ts "$payer" "$DUMPS/payer-tslax.json" 2 $TSLAX) >/dev/null
  local ataQ ataT clones=""
  ataQ="$(python3 -c "import json;print(json.load(open('$DUMPS/payer-qqqx.json'))['pubkey'])")"
  ataT="$(python3 -c "import json;print(json.load(open('$DUMPS/payer-tslax.json'))['pubkey'])")"
  for m in $QQQX $TSLAX; do
    for prog in $DBC $DAMM; do
      clones="$clones --clone $(cd "$ROOT" && npx tsx -e "import {PublicKey} from '@solana/web3.js';console.log(PublicKey.findProgramAddressSync([Buffer.from('token_badge'),new PublicKey('$m').toBuffer()],new PublicKey('$prog'))[0].toBase58())")"
    done
  done
  pkill -f "solana-test-validator.*$LEDGER" 2>/dev/null || true
  rm -rf "$LEDGER"
  nohup "$S/solana-test-validator" --reset --quiet --ledger "$LEDGER" \
    --bpf-program $DBC "$DUMPS/$DBC.so" \
    --bpf-program $DAMM "$DUMPS/$DAMM.so" \
    --bpf-program $META "$DUMPS/$META.so" \
    --bpf-program $T22 "$DUMPS/$T22.so" \
    --bpf-program $SCRIP "$ROOT/anchor/target/deploy/scrip-devnet.so" \
    --clone $QQQX --clone $TSLAX $clones --clone $DAMM_CONFIG \
    --account "$ataQ" "$DUMPS/payer-qqqx.json" \
    --account "$ataT" "$DUMPS/payer-tslax.json" \
    --url "$MAIN" > "$LEDGER.log" 2>&1 &
  for _ in $(seq 1 90); do
    if "$S/solana" cluster-version -u http://127.0.0.1:8899 >/dev/null 2>&1; then break; fi
    sleep 1
  done
  "$S/solana" airdrop 100 "$payer" -u http://127.0.0.1:8899 >/dev/null
  echo "curve localnet up on :8899; payer $payer funded; its Nasdaq 100 account $ataQ, its Tesla account $ataT"
}

case "${1:-}" in
  start) start "${2:?payer address}" ;;
  stop) pkill -f "solana-test-validator.*$LEDGER" 2>/dev/null || true; echo stopped ;;
  *) echo "usage: scripts/curve-localnet.sh start <payer> | stop"; exit 2 ;;
esac

# Build order (dependency order, not versions)

> **Where it stands, 2026-09-15.** Everything below is built. The program is deployed to
> **devnet** and `npm run test:devnet` runs eleven on-chain tests through it, all passing:
> both sweep paths (the raw-token feed and the share feed through the live multiplier), the
> introspection refusal, a fill below the Pyth minimum reverting, the watermark sync after a
> spend, the intake, a release below the payer's minimum refused, a sponsored position
> claimed from an empty wallet with a relayer paying, a measurement refused before its
> window, and a pause that is a `revoke` the program never sees. What is NOT done: a mainnet
> deploy (2.98 SOL, measured on devnet with the real binary), and a Pyth API key for the keeper (Hermes has required one since
> 2026-08-26). Both are the founder's to fund.

**The target is the whole product in `docs/scrip.md`.** This list is dependency order only:
a balance cannot be painted before it can be computed, a receipt cannot be written before
there is something to receive. Nothing here is optional.

## 0. The program — the rule and the record
`Book`, `Handle`, `Payout`, `Receipt`. Fifteen instructions. The sweep atomic without a
Jupiter CPI: instruction introspection in `begin_sweep`, delta verification against Pyth in
`finish_sweep`, the min-out through the live scaled-UI multiplier when the feed prices a
share. The registry compiled in; a `devnet` feature that accepts any asset so the mechanics
can be proven with stand-in mints. Forty unit tests on the arithmetic, the parsers and the
registry. **Built. Deployed to devnet.**

## 1. The mirrors — every money rule, once more in TypeScript, held to the Rust by a test
The slice formula, the min-out, the slug rule, the memo hash, the registry, the program id.
Instruction builders encoded from the committed IDL with round-trip tests; account decoders
through the IDL's own layouts. **Built.**

## 2. The rule — open a book, turn it on, change it, pause it
`/app/rule`: presets and a slider, the asset, floor and cap, escalation, the allowance
explained, the float with "about N sweeps". One signature: approve, float, enable. Pause is
`revoke`. `/api/rule/tx` composes; the wallet signs. **Built.**

## 3. The sweep — the keeper
Watches every Book with the rule on, subscribes to each USDC account, syncs the watermark
after a spend, posts a fully verified Pyth update when the on-chain one is stale, quotes
Jupiter, assembles `[compute, begin, route, finish]`, signs, reports health. **Built;
mainnet-only by nature.** The on-chain battery proves the transaction shape with a stand-in
route.

## 4. The receipt page — the artifact people share
`/receipt/[sig]` from one signature: the stub, what arrived with the issuer's powers on the
row, where it is anchored, still-held at 7 and 30 days. `opengraph-image` renders the stub.
No client JavaScript but the copy button. **Built.**

## 5. Intake — the pay link and the request
`/pay/[handle]`: amount, reason, a live Jupiter quote, a wallet button, a Solana Pay QR that
carries the release id the page watches. `/api/pay/tx` builds one versioned transaction:
memo, fund, Jupiter into the escrow, release. `/app/request` makes a prefilled link.
**Built.**

## 6. Sponsor and claim
An address with no book, or no address at all, gets a sponsored position in escrow.
`/claim/[payer]/[rid]` claims it with the fee covered by a relayer, opening a book on the way;
a link-based claim adds the claim key from the URL fragment. **Built; proven on devnet.**

## 7. Measure — keep-rate
`measure_receipt` at 7 and 30 days, called by the crank or anyone. Keep-rate computed from
raw units, per recipient and asset, weighted by dollars; holds rather than reports when a
matured receipt was not measured. **Built.**

## 8. The public record and the landing
The indexer, incremental with a cursor, attributing sweeps from transfer history;
`/ledger`; the landing with the live stub and the worked example. **Built.**

## After Stocklana
Mixes, round-ups, the embedded-wallet door, the organisation surface, Backpack
mint-and-redeem for keepers, cross-chain arrivals, yield, credit, multisig then freeze of the
upgrade authority. Each is one more destination for the same standing instruction.

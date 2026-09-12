# Build order (dependency order, not versions)

> **Where it stands, 2026-09-12.** Steps 0 to 8 are built. The program is deployed to devnet
> and a real payout, a real sponsored claim and a real goal skim have run through it
> (`npm run test:devnet`). What is NOT done: a mainnet deploy, which needs ~2.3 SOL; the email
> sign-in door, which needs an embedded-wallet app id; and the docs beyond the index page.


**The target is the whole product, not a stripped-down first release.** This list is
dependency order only: a balance cannot be painted before it can be computed, and a receipt
cannot be written before there is something to receive. Nothing here is optional and nothing
is deferred to a "later version". Everything ships by 12 October.

## 0. Scaffold
Next.js 15 + TS strict, `globals.css` (preflight only) + `tokens.css`, Inter and JetBrains
Mono, drizzle + better-sqlite3, Vitest, Anchor workspace. Port the shell from Sage.

## 1. Quantity that survives a corporate action
The multiplier watcher and the adjusted-quantity model. Every number on every screen is
downstream of this. Tests: a dividend is not a gain; a 4-for-1 split is not a 300% return;
a mid-cycle entry values correctly after a later split; a stale feed holds rather than
guessing.

## 2. The book
`open_book`, `set_policy`, the sum-to-10,000 invariant. Grams and the equity sleeve on one
screen, priced by Pyth. This is the first thing that looks like a product.

## 3. Fund and release a payout
Escrow, release, receipts on chain. This is the demo: real assets land in real wallets with
a reason attached. Record the cohort at release so keep-rate is measurable at day 30.

## 4. The receipt page
Public, print-like, openable by anyone. It is the artifact people screenshot, so it gets
real design time, not leftover time.

## 5. Named send and request
QR, link, Blink. The second book created by the first user's send is the moment the loop
closes without us.

## 6. Sponsored first position
Sponsorship records and the claim flow, surfaced on `/assets`. Turn it on once there is
something worth giving a new holder.

## 7. Goal vaults
A named goal that skims a percentage of every inbound payout, able to spend only back into
the owner's book or out to the owner. Saving at the moment income arrives, which is the only
version that has ever worked at scale.

## 8. Public ledger and landing
Aggregates and an event stream, fed by real receipts. Never a fabricated row.

## Adjacent work, once the book above is complete
A published book as a work record, and copying a published mix from that page. Borrowing
against the book. Alerts. A spend rail. Confidential balances, if and when an issuer
enables them.

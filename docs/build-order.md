# Build order

Sequenced so the hardest correct thing exists before anything that depends on it, and so
there is a demoable path at the end of every step.

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
A named goal that skims a percentage of every inbound payout. Saving at the moment of
income, which is the only version that works.

## 8. Public ledger and landing
Aggregates and an event stream, fed by real receipts. Never a fabricated row.

## Later, only once the book is real
Borrow against the book. A work record of what you earned. Alerts. A spend rail.
Confidential balances, if and when the issuer enables them.

# Build order

Sequenced so that the hardest correct thing exists before anything that depends on it, and
so there is a demoable path at the end of every step.

## 0. Scaffold
Next.js 15 + TS strict, `globals.css` (preflight only) + `tokens.css`, Inter and JetBrains
Mono via `next/font`, drizzle + better-sqlite3, Vitest. Port the shell from Sage.

## 1. The corporate-action watcher — first, before any UI that shows a number
Poll issuer multipliers, store them, reconcile `qty_adjusted`, publish a reconciliation
receipt. Tests: dividend is not a gain; 4-for-1 split is not a 300% return; mid-cycle entry
values correctly after a later split; a stale feed holds rather than guessing.

**Why first:** every number on every screen is downstream of this, and it is the thing a
seven-day competitor cannot fake.

## 2. Reserve + policy
Anchor program: `open_reserve`, `set_policy`, the sum-to-10,000 invariant, events. No asset
custody. Tests on policy validation before anything touches money.

## 3. Fund and allocate
Allocator: quote each leg on Jupiter, sanity-check against Pyth, refuse outside the
slippage bound, build the bundle. Emit `Allocated`. First receipt page.

## 4. The reserve screen
Balance, positions, activity. Real numbers from step 1's accounting. This is the first
thing that looks like a product.

## 5. Pay
Send to a person, claim link if they have no reserve yet, receipt per payment. Second
account created by the first user's payment is the moment the loop closes.

## 6. Sponsored first position
Sponsorship records, claim flow, the `/assets` surface. This is the wedge; it turns on once
there is something for a new holder to be given.

## 7. Yield routing
Eligible equity legs to Kamino, gold leg to Oro. Principal and accrual tracked separately
so yield is never confused with price movement.

## 8. Public ledger and landing
`/ledger` with everything settled, and the landing page fed by it. No fabricated rows.

## Later, only once the account is real
Bounded delegate for unattended rebalancing, recurring buys, public reserve pages,
issuer-sponsored themed sleeves.

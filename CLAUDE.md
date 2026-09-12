# Webgold

> Canonical spec. When code and this document disagree, **the code wins** — record real
> drift under "Known drift" at the bottom rather than quietly editing this file.
>
> Written 2026-09-12, before the first line of product code. Everything below marked
> **(planned)** is intent, not fact. Move it out of "planned" only when it runs.
>
> **There is no v1 and no v2.** The target is the complete product described here, built
> through 12 October. Things are built in dependency order because a balance cannot be
> painted before it can be computed, and that order is in `docs/build-order.md`. Dependency
> order is not a version ladder, and nothing on that list is optional.

---

## 0. Start here

Read in this order, then say what you are building:

1. this file, sections 1 to 4
2. `docs/product.md` — the complete product
3. `docs/architecture.md` — accounts, instructions, the issuer constraints that bind the design
4. `docs/build-order.md` — dependency order. **Not versions.** The target is the whole product
5. `docs/reuse-from-sage.md` — exactly what to port from `/Users/macbookair/projects/SAGE`, and what never to
6. `docs/decisions.md` — settled questions. Reopening one needs a new fact, not a new opinion
7. `docs/strategy.md` — how this wins, and the metrics that are the submission
8. `docs/research.md` — every market claim with a source

Before touching any user-facing surface, invoke the **`webgold-ui`** skill.

---

## 1. The product, in ten seconds

**Web3 made assets programmable. Webgold makes ownership receivable.**

One book. Grams of gold on the home screen, silver beside them, a slice of the market one
tap inside. Value enters three ways and always arrives as ownership in the recipient's own
wallet, never as a number in someone else's ledger:

- **Earn** — a payer releases a payout denominated in the mix instead of a stablecoin.
- **Receive** — someone sends, or you request, a named slice.
- **Sponsor** — an issuer funds a first position for a new book.

**Every arrival carries a memory**: how it came, from whom, for what, with an on-chain
receipt anyone can open. That named arrival is the product. An exchange is a place to buy
and park; a wallet is a place to hold a number. Neither can tell you that 0.2 grams landed
for the work you shipped on Tuesday, and neither can receive a payment on your behalf as a
slice of the market. That is only possible because a share became a token anyone can build
on.

**It is not** a trading terminal, a robo-advisor, a leaderboard, a copy-trading product, or
a deposit box with a yield number on it.

### The boundary: Webgold settles, it does not judge

A payout carries a payer, recipients, a dollar value, a reason string and an optional
constraint on the asset set. Whether that reason was verified by an AI, approved by a human,
or merely asserted is **outside this system**. Any payer can use it: a person, a company, a
DAO, a sponsor. This keeps the build small and makes Webgold useful to everyone paying
anyone, rather than a rail for one other product.

**Webgold is a standalone company, not an add-on.** Nothing in the pitch, the docs or the
demo requires explaining a second product. What carries over from Sage is craft — the vault
that cannot overspend, receipt religion, propose-then-release, campaign UX, and the practice
of paying strangers in public — never a dependency.

### The three calls, settled

- **Gold is metal** — **Oro GOLD**, `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A`, priced
  against Pyth XAU. Chosen over Matrixdock XAUm by the rule the law already set, "whichever
  Jupiter can actually fill": ~$372k of depth against XAUm's ~$43k. It is also a plain SPL
  mint with **no freeze authority and no permanent delegate**. GLDx is a fund share and may
  never appear under grams.
- **The market sleeve is SPYx** by default. Other xStocks are held the way a wallet holds
  any token; single names are a recipient's choice, never the company's.
- **Inbound value follows the recipient's policy**, defaulting to **70% gold, 30% SPY**. A
  payer may constrain the asset set but never dictates weights. A named gift stays named;
  only unspecified value converts. *(Was 50/20/30. Silver failed the metal test it was
  required to pass — no allocated-silver token on Solana has real depth — so it left the
  default and the metal weight absorbed it. Evidence and the founder's decision:
  `docs/decisions.md`, 2026-09-12.)*

### The number that decides everything

**Keep-rate: the share of what was paid out that is still held thirty days later.** It
cannot be faked, and it is the difference between a payout and a farm. Instrument it at the
first release, because a cohort you did not record cannot be measured later.

### Honesty requirements, non-negotiable in copy

xStocks mints carry a **permanent delegate** and a **pause authority**: the issuer can move,
burn or freeze. Self-custody here means *not our custody*, not *nobody can touch it*.
Dividends are **reinvested, not paid**, so never show expected income. Say both plainly
rather than letting a judge find them.

**But the disclosure is per-row, never a banner.** Verified on chain 2026-09-12: Oro GOLD has
*no* freeze authority and *no* permanent delegate, so a blanket warning would be false about
the gold sleeve — and a false warning is the kind of lazy honesty that reads as dishonesty the
moment somebody checks. Each asset row states what is true of that mint.

## 2. Principles

> **The account is the product; the receipt is the proof.**

1. **Non-custodial by construction.** Constituents sit in the user's own token accounts.
   The program holds policy and emits receipts. It never holds the assets. A pooled claim
   would make this a fund; direct ownership does not.
2. **No model, no operator, and no program ever decides how much.** Weights come from a
   policy the user signed. Prices come from Pyth. Routing comes from Jupiter. Software
   executes a rule; it never exercises discretion over someone's money.
3. **Every money moment prints a receipt** at `/receipt/<signature>`, readable by anyone,
   anchored to a real transaction. Nothing is claimed that cannot be opened.
4. **Never show a number we cannot derive from chain state.** No simulated balances, no
   projected returns presented as returns, no fabricated activity.
5. **Savings-grade, not stable.** Gold and equities fall. The UI says so plainly. We are
   not competing with USDC for the cash position; we are competing for the idle position.

---

## 3. The hard part — corporate actions (build this first)

xStocks handles dividends and splits with an **on-chain multiplier that rebases balances**,
published before each ex-date and activated at 00:30 UTC the day after. Ondo does the
equivalent on Solana through Scaled UI.

**This breaks naive accounting.** Store raw token balances and compute returns from them,
and a dividend reads as a gain, a 4-for-1 split reads as a 300% return, and cost basis is
silently wrong from that day forward. Every basket, vault and "portfolio" product shipped
in this cohort will get it wrong, because the issuer APIs expose multipliers precisely
because apps get it wrong.

Webgold stores **multiplier-adjusted quantity and cost basis**, reconciles on every
multiplier change, and publishes the reconciliation as a receipt. It is unglamorous, it is
verifiable, and it is the moat a seven-day competitor cannot fake.

---

## 4. Architecture

### On-chain — the `webgold` Anchor program (planned)

The program is the **rule and the record**, never the vault.

| Account | Seeds | Holds |
| --- | --- | --- |
| `Reserve` | `[b"reserve", owner]` | owner, policy, version, opened_at, lifetime funded/paid |
| `Policy` (inline) | — | target weights `(mint, bps)[]`, drift band bps, rebalance cadence |

Instructions: `open_reserve(policy)`, `set_policy(policy)`, `record_allocation(legs)`,
`record_payment(recipient, legs)`, `close_reserve`. Each emits an event that becomes a
receipt row. Swaps execute against Jupiter from the user's own associated token accounts,
in the same transaction where possible.

**v2 — bounded delegate.** The user approves the Reserve PDA as an SPL token delegate with
a cap. The program may then rebalance without a signature, but the instruction can *only*
swap between whitelisted mints, *only* toward the signed policy weights, *only* inside a
Pyth-bounded price, and can *never* transfer to a third party. That is the same shape as
Sage's mandate: the policy proposes, the program disposes.

### Off-chain services

| Service | Job |
| --- | --- |
| **Allocator** | amount + policy → Jupiter quote per leg → transaction bundle |
| **Valuer** | Pyth 24/7 equity and metal feeds → NAV, time-weighted return |
| **Corporate-action watcher** | polls issuer multipliers, detects changes before ex-date, reconciles basis, writes the receipt |
| **Yield router** (v2) | eligible equity legs → Kamino; gold leg → Oro staking |
| **Pay rail** | sender tx (convert + transfer), claim link when the recipient has no account yet |
| **Receipt writer** | every action → row + public page |

### Data model (SQLite via drizzle + better-sqlite3, same as Sage)

`reserves`, `positions` (qty_raw, qty_adjusted, cost_basis_base, multiplier_at_entry),
`allocations`, `payments`, `multipliers` (mint, value, effective_at, source, seen_at),
`receipts`, `sponsorships`.

### Stack

Next.js 15 (App Router, RSC by default, `"use client"` only at interactive leaves),
TypeScript strict (no `any`, no `@ts-ignore`), Solana web3.js + Anchor, Jupiter for
routing, Pyth for valuation, Privy for email/embedded wallets, drizzle + better-sqlite3,
Vitest for the core (allocation math, multiplier reconciliation, policy validation).

### Assets in v1

One equity sleeve and one metal sleeve, from **one issuer family each**, disclosed. Deep
liquidity only. Do not mix four issuers with four different legal wrappers in v1.

---

## 5. Routes

| Route | What it is |
| --- | --- |
| `/` | landing |
| `/assets` | what a book can hold, issuer named on every row, sponsored first positions |
| `/app` | the book — grams, sleeves, arrivals (shelled) |
| `/app/pay` | fund and release a payout, or send a named slice |
| `/app/goals` | goal vaults that skim inbound (v2) |
| `/app/settings` | mix policy, disclosures |
| `/receipt/[sig]` | the named arrival, public and openable by anyone |
| `/ledger` | aggregates and the event stream |
| `/docs/*` | docs |

---

## 6. Design system

**One system, ported from Sage's "receipt minimalism" and re-toned.** Calm, premium-light,
print-like. `src/styles/tokens.css` is the single source of truth for colour, radius,
shadow, spacing, type and motion. Per-surface stylesheets **alias** tokens
(`--brass: var(--accent)`); they never redeclare a palette value. No Tailwind utility
classes anywhere — `globals.css` is the preflight reset and nothing else. No emoji; lucide
line icons only.

- **Colour.** Paper `#faf8f4`; warm ink `#1a1815`; **burnished gold `#9a6f1e` on every
  interactive and brand element**. Green `#15803d` and red `#dc2626` are reserved
  **strictly** for money outcomes (settled vs failed), never as generic accents.
- **Type.** Inter for UI, JetBrains Mono for data, amounts, addresses and hashes. Tabular
  numerals everywhere.
- **Radii.** 6 / 10 / 16, plus `999px` for status chips only.
- **Shell.** Fixed hover-expand left rail, top-centre mode pill, top-right context pills;
  sets `html[data-app-shell="on"]` so page content clears the fixed chrome.

Full detail and the port checklist: `docs/design-system.md`, and the `webgold-ui` skill in
`.claude/skills/`.

---

## 7. Standing policies

- **Money-critical code requires tests**: allocation math, multiplier reconciliation,
  policy validation, payment construction. `lint` + `typecheck` + `test` all green before
  anything ships.
- **Two lists that drift is the dominant defect shape** (carried over from Sage). Whenever
  a value is declared in two places, write the test that reads both.
- **Never invent a number on a surface.** If it cannot be derived from chain state or a
  stored receipt, it does not render.
- **Disclose the issuer.** Every asset row names whose token it is and what wrapper it is.

---

## 8. Commands

```bash
npm run dev        # next dev --turbopack
npm run build
npm run lint
npm run typecheck  # tsc --noEmit, strict
npm run test       # vitest run
```

---

## Known drift

Recorded as the code was written, per the rule at the top: the code wins, and the difference
gets written down rather than quietly edited away.

| This file / docs say | The code does | Why |
| --- | --- | --- |
| §4 names the account `Reserve` and the tables `reserves`, `allocations`, `payments` | `Book` / `books`, and `payouts` + `transfers` | Every other document — `product.md`, `architecture.md`, `strategy.md` — says **book**, and the product's own copy is "one book". One vocabulary; `architecture.md`'s table names won |
| `architecture.md` lists BOTH a `books.policy_json` column and a separate `policies` table | the policy lives on `books.policy_json` only | A value declared in two places is the dominant defect shape this repo is built to avoid, and the doc declares it twice. The on-chain `Book` account holds the policy, so the mirror does too |
| §5 marks `/app/goals` "(v2)" | it is a route from the scaffold, built at build-order step 7 | There are no versions. `build-order.md` settles it |
| §4 implies the Anchor program sits at the repo root | it is a workspace at `anchor/` | A Rust `target/` at the root would sit inside the Next build's watch path. `anchor/target` is gitignored; the IDL and types the app needs are synced into `src/lib/anchor/` by `scripts/sync-idl.mjs` and committed, with `src/lib/solana/program.test.ts` failing on any drift between the three places the program id is written |
| §8 lists five commands | plus `npm run anchor:build`, `anchor:test`, `db:generate`, `format` | Additions, not changes |
| §1 said the default mix is 50 gold / 20 silver / 30 SPY | **70 gold / 30 SPY** | Not drift — a founder decision on evidence the law demanded be gathered ("verify before shipping the default 50/20/30"). Silver failed: every silver token on Solana is a fund tracker or a miner. Recorded in `docs/decisions.md`, and the lines above were updated rather than left to contradict the code |
| §3 and `docs/research.md` describe the multiplier as one value activated at 00:30 UTC | the extension carries TWO values and a timestamp, and the live one is `newMultiplier` once that timestamp passes; the one activation observed on chain is 04:00 UTC | Reading the field named `multiplier` paints every SPYx balance 0.18% short, forever. `src/lib/corporate-actions/multiplier.ts` holds the rule and the evidence |

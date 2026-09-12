# Webgold

> Canonical spec. When code and this document disagree, **the code wins** — record real
> drift under "Known drift" at the bottom rather than quietly editing this file.
>
> Written 2026-09-12, before the first line of product code. Everything below marked
> **(planned)** is intent, not fact. Move it out of "planned" only when it runs.

---

## 1. The product, in ten seconds

**You have USDC sitting in a Solana wallet. You are never going to open a brokerage
account. Webgold turns that balance into a real portfolio — the stock market, gold and
silver — held in your own wallet, accounted for correctly, earning where it can, and
payable to any other person.**

One line for a judge: **the account where crypto money becomes real assets.**

It is **not** a trading terminal, **not** a robo-advisor, **not** a yield farm, **not** a
leaderboard, **not** an SDK with no app on top. It is the front door: the place a balance
lives. Front doors take markets; features get absorbed by wallets.

### The user

Someone who already has a Solana wallet and whose entire net worth is one correlated bet:
SOL, a few tokens, and USDC that loses value every year. They are not a trader. They will
not learn to be one. They want to stop being 100% crypto and they cannot walk into a
brokerage.

### Why this exists now and could not exist before

Three facts had to become true at once, and all three became true in 2026:

- **Equities became tokens.** xStocks (Kraken) carries 700+ names; Ondo Global Markets
  carries 250+ stocks and ETFs including commodity ETFs. Solana clears roughly 95% of all
  on-chain tokenized-equity volume.
- **Metals became tokens with yield.** Oro's GOLD pays 3–4% from real gold leasing
  (physical, Brinks Dubai, RSM-audited); Matrixdock XAUm, PAXG and XAUT are all on Solana.
  Gold and silver token market cap on Solana grew **689% in twelve months**.
- **Fees fell far enough that a $5 position and a fractional send are economic.**

A brokerage cannot send you a sliver of Apple in five seconds. A bank cannot pay you in
grams. That is the uncopyable property, and it is the whole company.

### The hole in the market

Billions in volume, tens of thousands of holders. The category has **traders, not owners**,
because every front door is a venue (Jupiter, Raydium), a wallet (Phantom), a money market
(Kamino) or an exchange behind its own KYC (Kraken, Backpack). Nobody owns the holder
relationship. That seat is open.

### The wedge — how the first thousand holders arrive

**A sponsored first position.** An issuer funds a new holder's first slice of gold or the
market; the holder must hold it inside the account; the account is what they keep.
Automatic enrollment lifts retirement-plan participation from 64% to 94%, and employer
matching is the most proven acquisition device in consumer finance. Nobody in crypto has
copied it. The money comes from issuer distribution budgets (Kraken's xPoints, Jupiter's
xStocks rewards), **not** from the founder's wallet. Seed week one personally to have
something real to point at, then convert to sponsor money.

### Why a wallet cannot absorb this

The honest question a judge will ask is "why not just do three Jupiter swaps?" Four
answers, and they are the build order:

1. **Correct accounting through corporate actions.** See §3. This is the hard part.
2. **Yield routing** across lending and leasing, which a wallet will not do.
3. **Rule-based rebalancing** the user signs once, with a receipt each time.
4. **The pay-in rail**: being paid into an account, not just holding one.

---

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
| `/assets` | explore: what you can hold, and the sponsored first positions |
| `/app` | the reserve — balance, positions, activity (shelled) |
| `/app/pay` | send to a person |
| `/app/settings` | policy, mix, disclosures |
| `/receipt/[sig]` | public receipt, anchored to a signature |
| `/ledger` | public record: reserves opened, payouts settled, volume |
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

Nothing yet. This file was written before the first commit.

# Webgold — what this is, and what currently exists

> A description of the project as it stands on 2026-09-15. It records what the product is
> meant to be, what has been built, and what the built thing does when you run it.
>
> It contains no recommendations, no priorities and no plan. Observations are stated as
> observations, with the measurement that produced them.

---

# Part 1 — The idea

## In one line

**Web3 made assets programmable. Webgold makes ownership receivable.**

## The longer version

One book. Grams of gold on the home screen, a slice of the market one tap inside. Value
enters three ways, and it always arrives as **ownership sitting in the recipient's own
wallet** — never as a number in somebody else's ledger:

| How value arrives | What happens |
| --- | --- |
| **Earn** | A payer escrows value with a reason attached and releases it. The recipient's own policy turns it into grams and share-equivalents. |
| **Receive** | Someone sends, or you request, a named slice. A named gift stays named — only unspecified value converts. |
| **Sponsor** | An issuer funds a first position into an empty book. A new holder appears without anyone deciding to open an account. |

**Every arrival carries a memory** — how it came, from whom, for what — with an on-chain
receipt anyone can open at `/receipt/<signature>`. That named arrival is the product.

The stated reasoning: an exchange is a place to buy and park, and a wallet is a place to hold
a number. Neither can tell you that 0.2 grams landed for the work you shipped on Tuesday, and
neither can receive a payment on your behalf as a slice of the market. That is only possible
because a share became a token anyone can build on.

## What it is defined as not being

Not a trading terminal. Not a robo-advisor. Not a leaderboard. Not copy-trading. Not a
deposit box with a yield number on it.

## The boundary — Webgold settles, it does not judge

A payout carries a payer, a recipient, a dollar value, a reason string and an optional
constraint on the asset set. **Whether that reason was verified by an AI, approved by a
human, or merely asserted is outside this system.** Any payer can use it: a person, a
company, a DAO, a sponsor.

This is a deliberate scope wall. The stated purpose is to keep the build small and make
Webgold useful to everyone paying anyone, rather than a rail for one other product. Webgold
is intended as a standalone company: nothing in the pitch, the docs or the demo requires
explaining a second product.

## The three asset calls

1. **Gold is metal.** Oro GOLD, `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A`, priced
   against Pyth XAU. Chosen over Matrixdock XAUm on depth (~$372k vs ~$43k). It is a plain
   SPL mint with no freeze authority and no permanent delegate. GLDx is a fund share and is
   not permitted to appear under grams.
2. **The market sleeve is SPYx** by default. Other xStocks are held the way a wallet holds
   any token; single names are a recipient's choice, not the company's.
3. **Inbound value follows the recipient's policy**, defaulting to **70% gold / 30% SPY**. A
   payer may constrain the asset set but does not dictate the weights.

The default was originally 50 gold / 20 silver / 30 SPY. It was changed after a check found
that every silver token on Solana is a fund tracker or a miner's equity, and SLVon's depth is
~$48k. Recorded in `docs/decisions.md`, 2026-09-12.

## The metric the project is built around

**Keep-rate: the share of what was paid out that is still held thirty days later.**

It requires a cohort snapshot recorded *at release*, which is why that lives in the program
rather than in an analytics layer — a cohort not recorded at release cannot be measured
afterwards.

## Stated honesty requirements

- xStocks mints carry a **permanent delegate** and a **pause authority**: the issuer can
  move, burn or freeze. Self-custody here means *not our custody*, not *nobody can touch it*.
- Dividends are **reinvested, not paid**. Expected income is never shown.
- **Disclosure is per-row, never a banner**, because Oro GOLD has no freeze authority and no
  permanent delegate, so a blanket warning would be false about the gold sleeve.

## The five principles the project states for itself

1. **Non-custodial by construction.** The program holds policy and emits receipts; it never
   holds the assets.
2. **No model, no operator and no program decides how much.** Weights come from a signed
   policy, prices from Pyth, routing from Jupiter.
3. **Every money moment prints a receipt** anyone can open.
4. **Never show a number that cannot be derived from chain state.**
5. **Savings-grade, not stable.** Gold and equities fall, and the UI says so.

---

# Part 2 — What has been built

## Repository

| | |
| --- | --- |
| Commits | 23 on `main`, working tree clean |
| Page code | ~1,500 lines across 10 surfaces |
| Component code | ~1,780 lines |
| CSS | 2,355 lines, of which `tokens.css` is 164 |
| Offline tests | **242 passed, 16 skipped** (21 files passed, 3 skipped), ~4s |
| Rust unit tests | 27 |
| `lint` / `typecheck` / `build` | clean as of 2026-09-15 |

## Stack

Next.js 15 App Router, RSC by default with `"use client"` only at interactive leaves.
TypeScript strict with `noUncheckedIndexedAccess`. Anchor 0.31.1. Solana web3.js. Pyth for
valuation. Jupiter for routing. drizzle + better-sqlite3 behind a lazy proxy. Vitest with
`pool: "forks"` and per-file isolation. Wallet Standard rather than wallet-adapter UI.

## The Anchor program

Deployed to **devnet** at `3siGeKgHp7pvVVmjbdtBemeirNRPSFHyMXBJu3CXZ3hX`, upgradeable.
Nine instructions, five accounts (`Book`, `Payout`, `Receipt`, `Cohort`, `Goal`).

| Instruction | What it does |
| --- | --- |
| `open_book` | Creates a `Book` PDA carrying the owner's signed policy |
| `set_policy` | Replaces the mix; re-validates sum-to-10,000 and the leg cap |
| `close_book` | Returns rent |
| `fund_payout` | Escrows value under a release id |
| `release_payout` | Moves every leg into the recipient's own ATAs, writes a `Receipt` and a `Cohort` in the same instruction |
| `claim_payout` | A sponsored payout with no named recipient, claimed by whoever arrives |
| `cancel_payout` | Returns escrow to the payer |
| `set_goal` | A named goal vault that skims a percentage of inbound |
| `withdraw_goal` | Pays the goal's owner, and only the owner |

Constants: `TOTAL_BPS=10_000`, `MAX_LEGS=8`, `MAX_DRIFT_BPS=5_000`, `MAX_PAYOUT_LEGS=8`,
`MAX_REASON_LEN=200`, `ACCOUNTS_PER_LEG=4` (5 with a goal), `MAX_SLUG_LEN=32`,
`MAX_GOAL_NAME_LEN=64`, `MAX_SKIM_BPS=5_000`.

Two implementation details:

- **`move_leg` takes the token program per leg**, checked against the mint's own owner. Oro
  GOLD is classic SPL and SPYx is Token-2022, so a single token program per instruction
  cannot pay the product's own default mix.
- **`split_for_goal` truncates toward the person, not the vault.** The remainder goes to the
  saver. u128 intermediate.

## What has been exercised on chain

`npm run test:devnet` runs 8 tests through the deployed program and reads the accounts back.
The program has **47 signatures** on devnet, carrying **12 receipts**. Exercised:

- a two-leg payout across both token programs
- receipt and cohort written in the same instruction as the transfer
- a double release refused
- a sponsored position funded with no recipient, claimed by whoever turned up
- a second claim refused by the account model rather than by a check — the receipt's PDA
  address is the record
- a goal that pays its owner and refuses a third party when its own owner asks
- a 25% skim splitting exactly 25,000 / 75,000

## The libraries

| Module | Job |
| --- | --- |
| `lib/money.ts` | Exact integer/decimal arithmetic. `Decimal = {units: bigint, scale: number}`. No floats near money. |
| `lib/outcome.ts` | `Outcome<T>` = `{ok:true,value}` \| `{ok:false,why}`. Failure returns a value; nothing throws for control flow. |
| `lib/assets/registry.ts` | The asset registry. Every field read off **mainnet** on 2026-09-12 — decimals, token program, freeze authority, permanent delegate, Pyth account. |
| `lib/pyth/price.ts` | Price-account parsing, with per-feed staleness and confidence bounds. |
| `lib/corporate-actions/multiplier.ts` | Which rebase multiplier is live, and when. |
| `lib/corporate-actions/reconcile.ts` | Adjusted quantity always recomputed from raw; a multiplier change never moves cost basis. |
| `lib/valuer.ts` | Leg and book valuation. Grams only from metal, never from a fund. |
| `lib/policy.ts` | Mirrors `Policy::validated` in the program; its test parses the Rust body. |
| `lib/allocator.ts` | Recipient's policy sets the proportions; a payer's constraint narrows the set then re-normalises. |
| `lib/keep-rate.ts` | 30-day window. Holds before maturity, holds when a matured cohort is unmeasured, does not cap at 100%. |
| `lib/ledger/indexer.ts` | Mirrors on-chain receipts into the cache. |
| `lib/session/*` | Sign-in with Solana: nonce → server-rebuilt message → ed25519 verify → HMAC cookie. |

### The corporate-action rule as implemented

xStocks rebases balances with an on-chain multiplier. The extension carries **two** values and
a timestamp, and the implementation treats `newMultiplier` as live once that timestamp has
passed:

```
const activated = now >= snap.effectiveAt;
const live = activated ? newer.value : older.value;
```

Sanity band `[0.02, 50]`, refuses zero, refuses future-dated snapshots, holds rather than
guesses on a stale feed. The recorded reason for reading `newMultiplier` rather than the
field named `multiplier`: on the values measured on 2026-09-12 (1.003909240011759 vs
1.005714560286254, effective 2026-06-18), the obvious field is 0.18% low.

The stated consequence of storing raw balances instead: a dividend reads as a gain, a 4-for-1
split reads as a 300% return, and cost basis is wrong from that day forward.

## The surfaces

| Route | What is on it |
| --- | --- |
| `/` | Hero + live arrivals card, three-ways band, a "grams first, dollars last" table, three honesty callouts, one dark closing section, footer. |
| `/assets` | Row list. Issuer named on every row, per-mint disclosure chips, decimals, default weight, and the silver finding stated in full. |
| `/app` | The book. Gated on a wallet signature. |
| `/app/pay` | Fund and release a payout, or send a named slice. Gated. |
| `/app/request` | A link and a QR that open the payer's own form. Gated. |
| `/app/goals` | Goal vaults. Gated. |
| `/app/settings` | The mix policy editor. Gated. |
| `/ledger` | Five aggregates then the settled event stream. |
| `/receipt/[sig]` | Reads the chain directly, never the cache. Unshelled, print-like. |
| `/docs` + `/docs/corporate-actions`, `/docs/receipts`, `/docs/keep-rate` | Reading surfaces. |
| `/api/session{,/nonce,/me}`, `/api/chain/prepare`, `/api/pay/quote`, `/api/maintenance` | Routes. |

## What is not built

- A **mainnet deploy**. Cost is ~2.3 SOL.
- The **email sign-in door**. It needs an embedded-wallet provider app id. Both doors resolve
  through one cookie, so it would change the route that issues a session and nothing that
  reads one.
- Any **share image**: no `opengraph-image`, no `twitter-image`, no favicon exists in
  `src/app`.
- Adjacent work never started: published books, borrowing against a book, alerts, a spend
  rail, confidential balances.

---

# Part 3 — How it is configured and deployed

- **The assets are mainnet-only.** There is no devnet Oro GOLD. The registry is pinned to
  mainnet mints and read off mainnet. The recorded reason for not registering a devnet
  stand-in: it would be the same category of claim as calling a fund share a gram.
- **The program is deployed to devnet**, where all 47 signatures and 12 receipts live.
- **`NEXT_PUBLIC_SOLANA_CLUSTER`** selects the cluster and currently reads `mainnet-beta` in
  `.env.local`. It defaults to `devnet` when unset — the code comments that an unset variable
  must fail toward "this is not real money".
- The deployer keypair is `FKfq2AUUKWgubVtQ8ixyfR7zy5qEweqrzQrJqd2owoJb`, holding
  **2.0416 devnet SOL** and **0 mainnet SOL**, measured 2026-09-15.
- The SQLite cache lives at `var/webgold.db`. `src/lib/db/schema.ts` has no cluster column on
  any table.

---

# Part 4 — Observed behaviour

Everything in this section was produced by running the app on 2026-09-15 and reading the
result. No interpretation is attached.

## With `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta`

The network chip reads "Solana".

With the cache holding the 12 devnet receipt rows, `/ledger` renders:

```
RECEIPTS PUBLISHED   12
VALUE RELEASED       $7,371.15
GRAMS OUTSTANDING    41.9897 g
PEOPLE PAID          12
KEEP-RATE AT 30 DAYS No payout is 30 days old yet, so there is no keep-rate
                     to report. This figure appears once one is.
```

Each event row links to `/receipt/<sig>`. Opening one on this cluster renders:

```
          There is no receipt at that signature.
   No transaction with that signature has settled on this cluster.
                        5JncVV…doeR
```

With the cache empty, the same page renders `0`, `$0`, `0.0000 g`, `0`, and the event stream
renders "Nothing has settled yet — this stream is fed by receipts read off the chain."

## With `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`

`/receipt/3vLMw9LF…` renders:

```
                     4.9766 g of gold
             "shipped the receipt page on Tuesday"
         $995.84 of value, received 12 Sep 2026, 09:13 UTC

  What arrived                        in the recipient's own wallet
  Unrecognised mint                            160,000 base units
  5XX1… · Unknown issuer
  Unrecognised mint                         38,970,000 base units
  FFHk… · Unknown issuer

  Who, and where it is anchored
  From                                              FKfq2A…mJb
  To                                                49BXjL…GQgK
  Value at the price stamp                              $995.84
  Receipt account                                   23tynb…82Yq
  Transaction                                       3vLMw9…9nzA
  Slot                                              497,135,608
  Release                                           b269c8c7ced5…
```

The two leg rows resolve through `assetByMint(mint)?.symbol ?? mint.slice(0, 4)`
(`indexer.ts:228`); the devnet test mints are not in the mainnet-pinned registry.

The `/ledger` asset column on this cluster shows `5XX1`, `EKRa`, `87zE`, `4Kul`, `TyxP`,
`22Ki`, `9JY9 · EK1V`.

`POST /api/maintenance` returns:

```
SPYx:  mint account XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W does not exist
GLDx:  mint account Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re does not exist
SLVon: mint account iy11ytbSGcUnrjE6Lfv78TFqxKyUESfku1FugS9ondo does not exist
anyHeld: true
```

## The indexer's cursor

`src/lib/ledger/indexer.ts:58` reads the newest receipt by `at` and passes its signature as
`until` at line 64. `until` returns signatures newer than the one given.

Measured, three consecutive runs against devnet:

```
cache holds 1 row, stopAt = 5JncVVz9…      →  scanned 0, added 0
same RPC, same program id, same options,
called directly outside the app            →  47 signatures
after deleting var/webgold.db              →  scanned 47, added 12
```

The file's header states: *"delete the file and a re-index rebuilds it from Solana, because
every row is a copy of an account that still exists."*

## The wallet gate

`/app`, `/app/pay`, `/app/settings` and `/app/goals` each render the same card when no wallet
extension is present:

> No Solana wallet is installed in this browser. Install one — Phantom, Solflare and Backpack
> all work — or open Webgold in a wallet's own browser.

There is no other path into those four surfaces.

## Share metadata

`src/app/layout.tsx:40` sets `twitter: { card: "summary_large_image" }` and
`openGraph: { type: "website", siteName: "Webgold", url: SITE }`.

`generateMetadata` on `/receipt/[sig]` produces a per-receipt title and description, e.g.
title `4.9766 g received`, description `4.9766 g arrived for 49BXjL…GQgK — shipped the
receipt page on Tuesday`.

No image file or image route exists in `src/app`.

## Rendering at 375px

- `.mode-pill` (`app-shell.css:203`) is `position: fixed; top: 16px; z-index: 61` with an
  opaque `--bg` fill and no scrim behind it. On `/assets` mid-scroll, body text and mint
  addresses pass under it, with bare page visible above them.
- `.wg-stats` (`app.css:723`) is `repeat(auto-fit, minmax(160px, 1fr))`. At 375px this
  resolves to two columns for five stats on `/ledger`; the fifth card, "keep-rate at 30
  days", sits alone in a half-width cell and its explanatory paragraph runs under the bottom
  rail.
- Below 640px the landing hides all nav links, leaving the mark and the CTA.
- `/assets` rows stack without overflow.

## The content of the devnet ledger

The 12 receipts are the output of the test batteries. Every row is
`FKfq2A…mJb → <throwaway keypair>`, cycling three reason strings: *"a month of work"*,
*"a first position, on the house"*, *"shipped the receipt page on Tuesday"*.

---

# Part 5 — The design system as implemented

## Rules the codebase states for itself

1. `src/styles/tokens.css` is the only place a design value is defined. Per-surface
   stylesheets alias (`--brass: var(--accent)`) and never redeclare a palette value.
2. No Tailwind utility classes. `globals.css` is `@import "tailwindcss"` for preflight and
   nothing else.
3. Green (`--ok`) and red (`--err`) mean money outcomes only, never decoration.
4. One accent: `--accent` `#9a6f1e`, burnished gold, on every interactive and brand element.
5. Numbers are mono with tabular figures; body copy is Inter.
6. Radii are 6 / 10 / 16; `999px` is for status chips only.
7. No emoji; lucide line icons at `size={14|15}`, `strokeWidth={2}`.
8. An empty feed renders an honest waiting state, never a fabricated row.
9. Server-first; `"use client"` only at interactive leaves.
10. Motion uses `--dur-1|2|3` and `--ease-out|spring` only, so `prefers-reduced-motion`
    collapses everything by zeroing the duration tokens.

## Observed conformance

`tokens.css` is 164 lines and is the only place values are declared. No Tailwind utility
classes appear in any component or page. `globals.css` is 15 lines. Money colours appear only
on money outcomes. Radii hold. The reduced-motion block zeroes `--dur-1|2|3` at `:root`.

`--scrim-header` is declared in `tokens.css` and used once, by the landing header
(`landing.css:80`). It is not applied under the app shell.

## Token summary

```
surface   --bg #faf8f4   --surface #fff   --border #e8e2d6   --border-strong #d6cdbc
text      --ink #1a1815  --ink-warm #171512  --ink-muted #5c564c  --ink-faint #8d867a
brand     --accent #9a6f1e  --accent-strong #7a5715  --accent-soft #fbf3e3
money     --ok #15803d  --err #dc2626  --warn #b45309  + *-soft and *-border rings
dark      --ink-inverse #f4f2ee  --surface-inverse-raised #2a2620  --border-inverse #322d26
type      --fs-display/h1/h2/lead/body/mono, each with its --lh-* and --tracking-*
space     --s-1..--s-12, 8pt rhythm (--s-1 = 4px is the half-step)
motion    --dur-1 160ms  --dur-2 320ms  --dur-3 640ms  --ease-out  --ease-spring
```

## The shell

A fixed hover-expand left rail at `left: 16px`, vertically centred, `z-index: 60`. A
top-centre mode pill ("Book" / "Pay"). Top-right context pills carrying the network label and
identity. It sets `html[data-app-shell="on"]`; shelled containers take `padding-top: 78px`,
gain left padding under 1180px, and below 720px the rail becomes a bottom bar with
`padding-bottom: 92px`. The identity pill is hidden below 720px.

## What is on each surface

**`/`** — Eyebrow, display-type hero ending on "receivable" in accent, lead paragraph, two
CTAs, a sub-line. A live arrivals card on the right reading from the ledger. Then: a
three-ways band (Earn / Receive / Sponsor cards); a "Grams first. Dollars last." section with
a three-row table (Gold / The market / Dollars, each with a mono middle column and a
plain-language right column); three honesty callouts (self-custody, dividends reinvested,
savings-grade not stable); one dark section titled "An arrival you can open, forever" with a
single button; a thin footer.

**`/assets`** — Header, a warning callout stating the silver finding in full, a "Sponsored
first positions" card, then "Eligible mints" listing GOLD, SPYx, GLDx, SLVon, USDC. Each row
carries symbol, issuer name, wrapper description, truncated mint address in accent mono, and
chips: default weight, category, unit, decimals, and where applicable `permanent delegate`
and `freezable`. Beneath each row, a paragraph of plain-language disclosure. No prices are
shown.

**`/receipt/[sig]`** — Unshelled. Mark top-left, "RECEIPT" top-right. Centred: a "Settled on
chain" chip, the grams at display size with the unit in mono, the reason in quotation marks,
then value and UTC stamp. Two cards: "What arrived" (per-leg rows) and "Who, and where it is
anchored" (From, To, Value at the price stamp, Receipt account, Transaction, Slot, Release).
A footer paragraph: "This page is built from the chain, not from our database."

**`/ledger`** — Header, five stat cards, then a "Settled events" card listing rows of
`time ago · payer → recipient · reason · asset column · value`.

**`/app`, `/app/pay`, `/app/request`, `/app/goals`, `/app/settings`** — Each has a header
(eyebrow, h1, lead) and a single card. With no wallet, that card is the gate described in
Part 4.

**`/docs/*`** — Unshelled reading surface with its own top nav and a four-item pill nav.
Warm ink, measure capped around 68ch.

---

# Appendix

## Addresses

| What | Address |
| --- | --- |
| Program (devnet) | `3siGeKgHp7pvVVmjbdtBemeirNRPSFHyMXBJu3CXZ3hX` |
| Deployer | `FKfq2AUUKWgubVtQ8ixyfR7zy5qEweqrzQrJqd2owoJb` |
| Oro GOLD (mainnet) | `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A` |
| SPYx (mainnet) | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| GLDx (mainnet) | `Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re` |
| SLVon (mainnet) | `iy11ytbSGcUnrjE6Lfv78TFqxKyUESfku1FugS9ondo` |
| USDC (mainnet) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Pyth XAU/USD | `2UK6JWZKvqFwU7mAt76TePbtNn99MPzKMqZNq4DEPbCa` |
| Pyth SPYX/USD | `jf8MarLKgBte4f3NWufbNpGRCuBfJLhuZPuFigvSQR2` |
| Pyth receiver | `rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ` |

## Commands

```bash
npm run dev          # next dev --turbopack
npm run build        # writes .next-build, not .next
npm run lint
npm run typecheck
npm run test         # 242 pass, 16 skipped

npm run test:registry  # reads every mint off MAINNET, checks the registry's claims
npm run test:valuer    # values a book against live Pyth
npm run test:devnet    # 8 tests through the deployed program
npm run anchor:build
```

Maintenance — the watcher, the indexer and the cohort measurement, behind one shared secret:

```bash
curl -s -X POST http://localhost:3000/api/maintenance \
  -H "authorization: Bearer $WEBGOLD_MAINTENANCE_SECRET"
```

`NEXT_PUBLIC_*` is read at server start, so a cluster change needs a dev-server restart.

## Corrections made to the spec during the build

Four things the written spec asserted that did not match what was on chain. All four are
recorded in `docs/decisions.md` and in CLAUDE.md's "Known drift" table.

1. **Silver failed the metal test.** No allocated-silver token on Solana has meaningful
   depth. The default moved from 50/20/30 to 70/30 by founder decision on that evidence.
2. **The live multiplier is `newMultiplier`, not `multiplier`.**
3. **Observed activation is 04:00 UTC**, not the documented 00:30. Nothing hardcodes an hour.
4. **Oro GOLD has no freeze authority and no permanent delegate**, which is why disclosure is
   per-row rather than a banner.

A fifth, measured rather than documented: Pyth is not 24/7 on Solana. Measured feed ages on
2026-09-12 were USDC 7s, SPYX 195s, SPY 6h, XAU 9h, which is why `maxSettleAgeSeconds` is
per-feed rather than a single global bound.

## Two defects found in already-committed code during the build

- **Anchor's Borsh coder encodes `0` for a field name it cannot find**, without erroring.
  `driftBps` instead of `drift_bps` had been writing a 0% rebalance band into every policy
  since build step 2. Every encoder now round-trips in its test.
- **One token program per instruction cannot pay the default mix**, because Oro GOLD is
  classic SPL and SPYx is Token-2022. The token program is now per leg, checked against the
  mint's owner.

## Document map

| File | What it holds |
| --- | --- |
| `CLAUDE.md` | The canonical spec, plus a "Known drift" table recording where the code differs from it |
| `docs/product.md` | The complete product |
| `docs/architecture.md` | Accounts, instructions, issuer constraints |
| `docs/build-order.md` | Dependency order, steps 0–8, all built |
| `docs/decisions.md` | Settled questions and the evidence behind them |
| `docs/design-system.md` | The design system and the port checklist |
| `docs/research.md` | Market claims with sources |
| `docs/reuse-from-sage.md` | What was ported from the predecessor project |
| `docs/strategy.md` | The competition framing and the metrics |
| `.claude/skills/webgold-ui/` | The UI skill invoked before touching any surface |

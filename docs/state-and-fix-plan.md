# Webgold — state of the build, and the fix plan

> Written 2026-09-15, by reading the code, the chain and the running app rather than the spec.
> Where this contradicts `CLAUDE.md` or another doc, **this file is the observation and the
> other is the intent**. Every claim here was checked; where something was measured, the
> measurement is written next to it.
>
> This is the working document for the remaining days. Part 1 is the idea, Part 2 is what
> actually runs, Parts 3–5 are everything that is broken and how to fix it, Part 6 is the
> order to do it in.

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
receipt anyone can open at `/receipt/<signature>`. *That named arrival is the product.*

An exchange is a place to buy and park. A wallet is a place to hold a number. Neither can
tell you that 0.2 grams landed for the work you shipped on Tuesday, and neither can receive
a payment on your behalf as a slice of the market. That is only possible because a share
became a token anyone can build on.

## What it is not

Not a trading terminal. Not a robo-advisor. Not a leaderboard. Not copy-trading. Not a
deposit box with a yield number on it.

## The boundary — Webgold settles, it does not judge

A payout carries a payer, a recipient, a dollar value, a reason string and an optional
constraint on the asset set. **Whether that reason was verified by an AI, approved by a
human, or merely asserted is outside this system.** Any payer can use it: a person, a
company, a DAO, a sponsor.

This is a deliberate scope wall. It keeps the build small, and it makes Webgold useful to
everyone paying anyone rather than a rail for one other product. Webgold is a standalone
company: nothing in the pitch, the docs or the demo requires explaining a second product.

## The three calls, settled

1. **Gold is metal.** Oro GOLD, `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A`, priced
   against Pyth XAU. Chosen over Matrixdock XAUm on depth (~$372k vs ~$43k). It is a plain
   SPL mint with **no freeze authority and no permanent delegate**. GLDx is a fund share and
   may never appear under grams.
2. **The market sleeve is SPYx** by default. Other xStocks are held the way a wallet holds
   any token; single names are a recipient's choice, never the company's.
3. **Inbound value follows the recipient's policy**, defaulting to **70% gold / 30% SPY**.
   A payer may constrain the asset set but never dictates the weights.

*(Was 50/20/30. Silver failed the metal test it was required to pass — every silver token on
Solana is a fund tracker or a miner's equity, and SLVon's depth is ~$48k. Evidence in
`docs/decisions.md`, 2026-09-12.)*

## The number that decides everything

**Keep-rate: the share of what was paid out that is still held thirty days later.**

It cannot be faked, and it is the entire difference between a payout and a farm. It requires
a cohort snapshot recorded *at release* — which is why that lives in the program and not in
an analytics afterthought. A cohort you did not record cannot be measured later.

## Honesty requirements, non-negotiable in copy

- xStocks mints carry a **permanent delegate** and a **pause authority**: the issuer can
  move, burn or freeze. Self-custody here means *not our custody*, not *nobody can touch it*.
- Dividends are **reinvested, not paid**. Never show expected income.
- **The disclosure is per-row, never a banner.** Oro GOLD has no freeze authority and no
  permanent delegate, so a blanket warning would be false about the gold sleeve — and a
  false warning is the kind of lazy honesty that reads as dishonesty the moment somebody
  checks.

## The five principles everything is judged against

1. **Non-custodial by construction.** The program holds policy and emits receipts. It never
   holds the assets.
2. **No model, no operator and no program decides how much.** Weights come from a signed
   policy, prices from Pyth, routing from Jupiter.
3. **Every money moment prints a receipt** anyone can open.
4. **Never show a number that cannot be derived from chain state.**
5. **Savings-grade, not stable.** Gold and equities fall, and the UI says so.

---

# Part 2 — What actually runs today

## Summary

| | |
| --- | --- |
| Commits | 23, all on `main`, working tree clean |
| Anchor program | `3siGeKgHp7pvVVmjbdtBemeirNRPSFHyMXBJu3CXZ3hX` — **deployed to devnet**, upgradeable |
| Deployer | `FKfq2AUUKWgubVtQ8ixyfR7zy5qEweqrzQrJqd2owoJb` — 2.0416 devnet SOL, **0 mainnet SOL** |
| Offline tests | **242 passed, 16 skipped** (21 files passed, 3 skipped) in ~4s |
| Rust unit tests | 27 |
| Live batteries | `test:registry`, `test:valuer` (mainnet), `test:devnet` (8 tests, deployed program) |
| `lint` / `typecheck` / `build` | clean |
| Page code | ~1,500 lines across 10 surfaces |
| Component code | ~1,780 lines |
| CSS | 2,355 lines, of which `tokens.css` is 164 |

## The program

Nine instructions, five accounts. The program is **the rule and the record, never the vault**.

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
| `withdraw_goal` | Pays the goal's owner — and **only** the owner |

Constants: `TOTAL_BPS=10_000`, `MAX_LEGS=8`, `MAX_DRIFT_BPS=5_000`, `MAX_PAYOUT_LEGS=8`,
`MAX_REASON_LEN=200`, `ACCOUNTS_PER_LEG=4` (5 with a goal), `MAX_SLUG_LEN=32`,
`MAX_GOAL_NAME_LEN=64`, `MAX_SKIM_BPS=5_000`.

Two design points worth keeping in mind when reading it:

- **`move_leg` takes the token program per leg**, checked against the mint's own owner. Oro
  GOLD is classic SPL and SPYx is Token-2022 — one token program per instruction could only
  ever pay half of the product's own default mix.
- **`split_for_goal` truncates toward the person, not the vault.** The remainder goes to the
  saver. u128 intermediate so the multiply cannot overflow.

### What has actually been proven on chain

`npm run test:devnet` runs 8 tests through the deployed program and reads the accounts back.
On devnet the program has **47 signatures** and **12 indexable receipts**. Proven:

- a two-leg payout across **both token programs**
- receipt and cohort written in the same instruction as the transfer
- a double release refused
- a sponsored position funded with **no recipient**, claimed by whoever turned up
- a second claim refused — by the account model, not by a check: the receipt's PDA address
  *is* the record
- a goal that pays its owner and **refuses a third party even when its own owner asks**
- a 25% skim splitting exactly 25,000 / 75,000

## The libraries

| Module | Job |
| --- | --- |
| `lib/money.ts` | Exact integer/decimal arithmetic. `Decimal = {units: bigint, scale: number}`. No floats anywhere near money. |
| `lib/outcome.ts` | `Outcome<T>` = `{ok:true,value}` \| `{ok:false,why}`. Failure returns a value; nothing throws for control flow. |
| `lib/assets/registry.ts` | The verified asset registry. Every field read off **mainnet** on 2026-09-12 — decimals, token program, freeze authority, permanent delegate, Pyth account. |
| `lib/pyth/price.ts` | Price-account parsing, plus per-feed staleness and confidence bounds. |
| `lib/corporate-actions/multiplier.ts` | **The moat.** Which multiplier is live, and when. |
| `lib/corporate-actions/reconcile.ts` | Adjusted quantity always recomputed from raw; **a multiplier change never moves cost basis**. |
| `lib/valuer.ts` | Leg and book valuation. Grams only from metal, never from a fund. |
| `lib/policy.ts` | Mirrors `Policy::validated` in the program, with a test that reads the Rust body. |
| `lib/allocator.ts` | Recipient's policy sets the proportions; the payer's constraint narrows the set then re-normalises. |
| `lib/keep-rate.ts` | 30-day window. Holds before maturity; holds when a matured cohort is unmeasured; **does not cap at 100%**. |
| `lib/ledger/indexer.ts` | Mirrors on-chain receipts into the cache. |
| `lib/session/*` | Sign-in with Solana: nonce → server-rebuilt message → ed25519 verify → HMAC cookie. |

### The corporate-action rule, since it is the thing nobody else will get right

xStocks rebases balances with an on-chain multiplier. The extension carries **two** values
and a timestamp, and the live one is `newMultiplier` **once that timestamp has passed**:

```
const activated = now >= snap.effectiveAt;
const live = activated ? newer.value : older.value;
```

Reading the field named `multiplier` — the obvious one — paints every SPYx balance **0.18%
short, forever**. Sanity band `[0.02, 50]`, refuses zero, refuses future-dated snapshots,
holds rather than guesses on a stale feed.

Store raw balances and compute returns from them and a dividend reads as a gain, a 4-for-1
split reads as a 300% return, and cost basis is silently wrong from that day forward. Every
basket product shipped in this cohort will get this wrong.

## The surfaces

| Route | State |
| --- | --- |
| `/` | Built. Hero + live arrivals, three-ways band, the "grams first, dollars last" table, three honesty callouts, one dark closing section. |
| `/assets` | Built. Issuer named on every row, per-mint disclosure chips, the silver finding stated in full. |
| `/app` | Built, gated on a wallet. |
| `/app/pay` | Built, gated. Fund + release, or a named send. |
| `/app/request` | Built, gated. Link + QR that open the payer's form. |
| `/app/goals` | Built, gated. |
| `/app/settings` | Built, gated. The one surface where a weight is chosen, by a person. |
| `/ledger` | Built. Five aggregates + the settled stream. |
| `/receipt/[sig]` | Built. Reads the chain directly, never the cache. |
| `/docs`, `/docs/corporate-actions`, `/docs/receipts`, `/docs/keep-rate` | Built. |
| `/api/session{,/nonce,/me}`, `/api/chain/prepare`, `/api/pay/quote`, `/api/maintenance` | Built. |

## What is not built

- **A mainnet deploy** (~2.3 SOL). See Part 3 — this is the one that matters.
- **The email sign-in door.** Needs an embedded-wallet provider app id. Both doors resolve
  through one cookie, so it changes the route that *issues* a session and nothing that reads
  one.
- **Any share image.** See D6.
- Adjacent work never started, and correctly so: published books, borrowing, alerts, a spend
  rail, confidential balances.

---

# Part 3 — The truth about the demo right now

**This is the most important section in the document.**

The product is split across two chains and the split is currently visible to a visitor as an
outright contradiction.

- **The assets are mainnet-only.** There is no devnet Oro GOLD. The registry is pinned to
  mainnet mints, read off mainnet, and that was the right call — registering a fake gold
  mint would be the same category of lie as calling a fund share a gram.
- **The program is deployed to devnet**, where all 12 receipts live.
- `NEXT_PUBLIC_SOLANA_CLUSTER` is currently **`mainnet-beta`**.

So today, with the app pointed at mainnet:

1. `/ledger` reports **12 receipts published, $7,371.15 released, 41.9897 g outstanding, 12
   people paid**, with the chrome saying **"Solana"**.
2. **Every single one of those twelve numbers is a devnet transaction.** None of them exists
   on mainnet.
3. Clicking any row opens `/receipt/<sig>` → **"There is no receipt at that signature. No
   transaction with that signature has settled on this cluster."**

The public record page advertises twelve settled receipts and every one of them is a dead
link. That is principle 4 — *never show a number that cannot be derived from chain state* —
failing in the most visible place in the product, and it is the first thing a judge who
clicks twice will find.

Pointed at devnet instead, the numbers become real and openable, but then the flagship
receipt page says **"Unrecognised mint · Unknown issuer · 160,000 base units"** for both
legs, because the devnet test mints are not in the mainnet registry (D3), and the
corporate-action watcher goes completely inert because none of the rebasing mints exist
there (D4).

**There is currently no cluster setting at which the product is coherent.** Fixing that is
the whole job, and the cheapest route through it is the mainnet deploy.

---

# Part 4 — Defects, ranked

Each one was reproduced. Evidence is written next to it.

---

## D1 — The cache serves one chain's rows under another chain's chrome  ·  **critical**

**What happens.** `src/lib/db/schema.ts` has **no cluster column on any table**. The
`receipts` table holds twelve devnet rows; the app is pointed at mainnet; `/ledger` renders
them as mainnet fact.

**Evidence.** Cache: 12 rows, all devnet signatures. Env: `mainnet-beta`. Chrome: "Solana".
Page: "Everything that has settled — 12 receipts published, $7,371.15". Row 1 →
`/receipt/5JncVVz9…` → "No transaction with that signature has settled on this cluster."

**Why it matters.** It is a fabricated aggregate wearing the product's own honesty copy, and
it makes every receipt link in the ledger dead.

**Fix.**
1. Add `cluster` (text, not null) to `receipts`, `cohorts`, `multipliers`, `positions`,
   `books` — every table that mirrors chain state.
2. Stamp it on write from `cluster()`; filter on it in `ledgerTotals`, `recentReceipts`,
   `receiptsFor`, `measureCohorts`.
3. **Write the drift test.** The cluster is now declared in two places — the env and every
   cached row — and two lists that drift is this repo's dominant defect shape. The test
   asserts no query path reads a row whose cluster differs from `cluster()`.

---

## D2 — The indexer's cursor poisons itself and can never backfill  ·  **critical**

**What happens.** `src/lib/ledger/indexer.ts:58` takes the newest receipt by `at` as a
cursor and passes it as `until` (line 64). `until` returns only signatures **newer** than
that one. So **anything older than the first receipt ever indexed is invisible forever**, and
no amount of re-running recovers it. Only deleting the database file does.

**Evidence, reproduced.**

```
before:  rows=1  stopAt=5JncVVz9…  →  scanned 0, added 0   (three consecutive runs)
same RPC, same program id, same options, called directly  →  47 signatures
after deleting var/webgold.db:                            →  scanned 47, added 12
```

Eleven of the twelve receipts on devnet were unreachable, permanently, through the product's
only indexing path.

**Why it matters.** It breaks the load-bearing claim in the file's own header — *"delete the
file and a re-index rebuilds it from Solana"*. It does not: a re-index rebuilds nothing, a
delete does.

**Fix.** The cursor must be **the newest signature examined**, not the newest receipt found.
Persist a separate `index_cursor` row (per cluster, see D1) written after each successful
page, and page with `before` until the cursor is reached rather than trusting a single
`until`. Test: seed a cache holding only the newest receipt, run the indexer, assert the
older ones are found.

---

## D3 — The registry is mainnet-only, so the flagship page says "Unrecognised mint"  ·  **critical**

**What happens.** `assetByMint(mint)?.symbol ?? mint.slice(0, 4)` (`indexer.ts:228`) and the
same lookup on the receipt page. On devnet, no mint resolves.

**Evidence — the live receipt page for `3vLMw9LF…`:**

```
                     4.9766 g of gold
             "shipped the receipt page on Tuesday"
         $995.84 of value, received 12 Sep 2026, 09:13 UTC

  What arrived                        in the recipient's own wallet
  Unrecognised mint                            160,000 base units
  5XX1… · Unknown issuer
  Unrecognised mint                         38,970,000 base units
  FFHk… · Unknown issuer
```

The headline confidently says *4.9766 g of gold*; four lines below, the page cannot name the
gold. And the ledger's asset column reads `5XX1`, `EKRa`, `87zE`, `4Kul`, `TyxP`.

**Why it matters.** `/receipt/[sig]` is, by the build order's own words, *"the artifact people
screenshot… it gets real design time, not leftover time."* It is the single most-shared
surface in the product and it is currently self-contradicting.

**Fix, in preference order.**
1. **Deploy to mainnet and demo there.** Every mint resolves, the watcher wakes up, the
   problem disappears rather than being worked around. This is the right answer.
2. If a devnet demo is still needed: a clearly-labelled devnet registry overlay, keyed by
   cluster, with a visible `devnet test mint` chip on every row so nobody can mistake it for
   the real asset. Never silently map a test mint onto Oro GOLD's name.
3. Regardless of 1 or 2: **an unrecognised mint must not render as a four-character stub.**
   Show the full address, mono, linked to the explorer, labelled "not in the registry".

---

## D4 — The corporate-action machinery is inert wherever it is demoed  ·  **high**

**Evidence.** `POST /api/maintenance` on devnet:

```
SPYx:  mint account XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W does not exist
GLDx:  mint account Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re does not exist
SLVon: mint account iy11ytbSGcUnrjE6Lfv78TFqxKyUESfku1FugS9ondo does not exist
anyHeld: true
```

The watcher holds instead of guessing, which is exactly right. But it means the deepest piece
of work in the product — the one thing a seven-day competitor cannot fake — **does nothing on
the cluster the demo runs on**, and there is no surface that shows it working.

**Fix.**
1. Mainnet (D3 fix 1) makes it live.
2. **Give it a surface either way.** `/docs/corporate-actions` explains the rule in prose;
   nothing in the product *shows* the live multiplier. A small panel on `/assets` — "SPYx
   multiplier in force 1.005714560286254, effective 18 Jun 2026, read from the mint at
   HH:MM" — is three hours of work and it is the strongest technical proof in the product.
   Read from the chain, so it stays honest when it holds.

---

## D5 — Without a wallet extension, four surfaces are the same dead end  ·  **high**

**What happens.** `/app`, `/app/pay`, `/app/settings`, `/app/goals` all render an identical
card: *"No Solana wallet is installed in this browser. Install one — Phantom, Solflare and
Backpack all work — or open Webgold in a wallet's own browser."*

**Why it matters.** A judge on a laptop without Phantom sees **nothing of the product** past
the landing page. The strategy doc's own failure list includes *"shipping a demo that has
never had a stranger use it"* — this is the version where the stranger cannot get in at all.

**Fix.**
1. **The email door** (already a known open item) removes this entirely. It needs a provider
   app id and nothing else — both doors resolve through one cookie.
2. Until then, give each gated surface a **read-only preview**: the real layout, populated
   from a public book read off the chain, with an honest "this is <address>'s book, sign in
   to see your own" band. Real chain state, no fabrication, and the product becomes legible
   without an extension.
3. The four identical cards should at minimum say four different things — what *this* surface
   will do once you are in.

---

## D6 — The share card claims a large image and there is no image  ·  **high**

**What happens.** `src/app/layout.tsx:40` sets `twitter: { card: "summary_large_image" }`.
There is **no `opengraph-image`, no `twitter-image`, and no `icon`** anywhere in `src/app`.
`generateMetadata` on the receipt page builds a good title and description — and then the
card has nothing to show.

**Why it matters.** The entire distribution plan is *"the founder runs the payer side in
public and posts the receipts. A receipt is a better post than a screenshot because anyone
can open it."* Every one of those posts currently unfurls as a bare text card.

**Fix.** A dynamic `opengraph-image.tsx` on `/receipt/[sig]` rendering the grams, the reason
and the stamp on paper with the mark — the same composition as the page. Next renders it at
the edge from the same chain read. Plus a static one for `/`, `/assets` and `/ledger`, and a
favicon. Half a day, and it is the highest-leverage half-day left.

---

## D7 — The floating mode pill sits on top of scrolling content  ·  **medium**

**What happens.** `.mode-pill` (`app-shell.css:203`) is `position: fixed; top: 16px;
z-index: 61` with an opaque `--bg` fill and no scrim behind it. On desktop the wide gutters
hide the problem. At 375px the content column is full-bleed, so body text and mint addresses
slide directly under the pill with 16px of bare page showing above them.

**Evidence.** `/assets` at 375px mid-scroll: the pill overlaps the "Oro" row, with
`GoLDppdj…GDiw6A` visible above it and "Allocated bullion…" below.

**Fix.** A top scrim on shelled pages. `--scrim-header` already exists and is already doing
exactly this job for the landing header (`landing.css:80`) — it is simply not applied under
the shell. Add a fixed ~72px bar with `backdrop-filter: blur(8px)` and a mask fading to
transparent, just below the pill's z-index. One rule, fixes every shelled surface at once.

---

## D8 — The ledger stat grid orphans a card and the bottom rail clips it  ·  **medium**

**What happens.** `.wg-stats` (`app.css:723`) is `repeat(auto-fit, minmax(160px, 1fr))`.
At 375px that resolves to two columns for **five** stats, so "keep-rate at 30 days" — the
most important number in the company — lands alone in a half-width cell, and its explanatory
paragraph runs under the bottom rail and is clipped.

**Fix.** Below 640px, make the grid one column and promote keep-rate to a full-width card at
the top with its own treatment. It is the submission; it should not be the orphan. Check the
shelled `padding-bottom: 92px` actually clears the rail on this page.

---

## D9 — `/assets` shows no prices  ·  **medium**

The design system's own page-pattern table says `/assets` is *"Row list, issuer named on
every row, sponsored positions marked. **Mono for prices**."* There are no prices. The Pyth
plumbing is built, tested and live — `npm run test:valuer` passes against mainnet — it is
simply not on the page.

**Fix.** A price column per row, mono and tabular, with the feed's age beside it and
`freshnessNote()` doing the talking when a feed is stale. This is also the cheapest possible
demonstration that the valuation layer is real.

---

## D10 — Goal-vault holdings are not surfaced on `/app`  ·  **medium**

`set_goal` / `withdraw_goal` work and are proven on chain, but the book page shows positions
without the goal vaults sitting beside them. A saver who has skimmed 25% into a goal cannot
see it from the one screen called "your book".

**Fix.** A goals band on `/app` reading `readGoals`, showing each goal's name, its skim
percentage and what it holds, with the withdraw action inline.

---

## D11 — The public ledger is currently twelve test-battery transactions  ·  **medium, and it is a judgement call**

Every row is `FKfq2A…mJb → <throwaway keypair>`, with three reason strings cycling: *"a month
of work"*, *"a first position, on the house"*, *"shipped the receipt page on Tuesday"*.

They are real on-chain transactions and the page does not lie about them. But a page titled
**"Everything that has settled"** showing one payer paying twelve throwaway addresses reads
as synthetic to exactly the audience it is meant to convince.

**Fix.** This is a founder decision, not an engineering one — see Part 7. The engineering
part: the ledger should distinguish **real releases from the test battery**, or the test
battery should run against a separate program id so it never enters the public record.

---

# Part 5 — UI/UX

## The system, and whether it is actually being followed

It is, and unusually well. `tokens.css` is 164 lines and is genuinely the only place a value
is defined. No Tailwind utilities anywhere. `globals.css` is fifteen lines of preflight.
Money colours are reserved for money. Radii hold at 6/10/16. The reduced-motion block
collapses the duration tokens so no component needs its own media query.

**Do not redesign the system.** The problems below are missing work and a few specific bugs,
not a wrong direction.

## Surface by surface

### `/` — landing · **strong, finish the close**

The hero holds: the display type is doing real work, the accent lands only on
"receivable" and the CTA, the live ledger card sits right. The three-ways band, the
grams-first table and the honesty callouts are the best argumentative copy in the product.

- The dark closing section is **too short** — one heading, one paragraph, one button, then
  a thin footer. It is the last thing a judge sees. It should carry the proof: keep-rate,
  receipts published, grams outstanding, each a link, in the inverse tokens.
- The empty-arrivals card says *"Nothing has settled yet"* — correct and honest, but it is
  the first thing on screen. Once D1/D2 are fixed and the app is on a cluster with real
  receipts, this fills itself. **Do not fake it in the meantime.**
- Below 640px every nav link is hidden, leaving the mark and the CTA. That was the right
  call for the 375px overflow but the nav is now unreachable on a phone. Add a single menu
  affordance or move `Assets · Ledger · Docs` into the footer where a phone visitor can
  still find them.

### `/receipt/[sig]` — **the most important page, and the most broken**

The composition is right: settled chip, grams at display size, the reason in quotes, value
and UTC stamp, then "What arrived" and "Who, and where it is anchored", then the honest
footer about the chain being the memory. Print-like, unshelled, screenshot-worthy.

Then it says "Unrecognised mint · Unknown issuer" (D3), and it has no share image (D6).

Once those are fixed, three things would make it finished:
- **A share affordance** — copy link, and an explicit "open on Solana Explorer".
- **The grams and the value should show their derivation.** "$995.84 at $4,364.68/oz,
  stamped 12 Sep 09:13 UTC" turns a number into a proof.
- **Print styles.** It is a receipt; someone will print one.

### `/assets` — **dense and honest, missing its numbers**

The per-row disclosure is the best honesty work in the product: `permanent delegate` and
`freezable` chips on SPYx and the funds, absent on Oro GOLD, exactly as the law requires. The
silver callout states the finding in full.

- No prices (D9).
- No live multiplier panel (D4).
- The mint address is truncated to `GoLDppdj…GDiw6A` with no copy button and no explorer
  link. On the page whose entire job is *"read from the mint accounts themselves"*, the
  address should be copyable and openable.
- At 375px the rows stack well. Good.

### `/app`, `/app/pay`, `/app/settings`, `/app/goals` — **gated, and therefore unjudged**

Four identical walls (D5). Beyond that, these are the surfaces nobody outside the build has
seen — which by the strategy doc's own reckoning is the most dangerous state for them to be
in. After the email door or the read-only preview lands, they need a real pass at 375px.

### `/ledger` — **right shape, wrong data**

Five aggregates then the stream is the correct structure, and the keep-rate card's held state
— *"No payout is 30 days old yet, so there is no keep-rate to report. This figure appears
once one is."* — is a model of how to render a number you do not have.

- D1, D2, D8 all land here.
- The asset column shows four-character mint stubs (D3).
- Rows are `payer → recipient` with no indication of which of the three doors the value came
  through. Earn, receive and sponsor are the product's three-part story; the ledger should
  show which one each row was.

### `/docs/*` — **good, and nearly done**

Warm ink, measure capped, pill nav across four pages. The corporate-actions page is the
strongest technical writing in the repo. Two gaps: no prose anywhere explains the **cluster
situation** to a reader (it should, plainly — the honesty is the brand), and there is no
"how to receive your first grams" page, which is the only doc a *user* rather than a judge
would look for.

## Cross-cutting

**Empty states.** The product's empty states are unusually good — honest, designed, explaining
*why* the space is empty rather than spinning. Keep this. It is the single most distinctive
UI quality the product has, and the temptation over the next four days will be to fill them
with something fake. Do not.

**Mobile.** D7 and D8 are the two real bugs. Everything else holds at 375px, which is better
than most. Re-check every shelled surface after the scrim fix.

**Focus and keyboard.** Needs one deliberate pass: tab through the pay form, the policy
editor and the rail, and confirm the ring is `--accent` and visible on paper *and* on the one
dark section.

**Motion.** The tokens are there and reduced-motion collapses them. Almost nothing uses them.
One restrained thing worth building: the arrivals feed on the landing revealing a new row
with `--dur-2`. Nothing else.

**Numbers.** Tabular figures are on globally. Verify alignment in the ledger's value column
once real rows of differing magnitude are in it.

---

# Part 6 — The fix order

Ranked by *what a judge sees*, not by what is most interesting to build.

### First — make the product coherent on one chain

1. **Fund and run the mainnet deploy** (~2.3 SOL). Everything below is cheaper afterwards:
   D3 and D4 dissolve, the registry resolves, the watcher wakes, the receipts are real.
2. **D1 — cluster column on every cached table**, plus the drift test. Do this even after a
   mainnet deploy; the devnet rows are still in the cache and the bug is structural.
3. **D2 — fix the indexer cursor.** With a test that seeds a partial cache.

### Second — make it shareable

4. **D6 — `opengraph-image` for `/receipt/[sig]`**, plus static cards and a favicon.
5. **D3 residue — an unrecognised mint renders as a full linked address**, never a stub.
6. **Receipt page finishing**: copy link, explorer link, price derivation, print styles.

### Third — make it enterable

7. **D5 — the email door**, or the read-only preview if the app id does not arrive.
8. **D9 — prices on `/assets`.**
9. **D4 — the live multiplier panel.** The strongest technical proof in the product, and it
   is currently invisible.

### Fourth — finish the surfaces

10. **D7 — the shell scrim.**
11. **D8 — mobile stat grid, keep-rate promoted.**
12. **D10 — goals on `/app`.**
13. Landing close carrying the real proof numbers; ledger rows showing which door.
14. Focus pass; the "receive your first grams" doc.

**Everything money-critical gets a test before it is called done.** That has held for 23
commits; it holds for the last four days too.

---

# Part 7 — Decisions only the founder can make

### 1. Mainnet deploy — ~2.3 SOL

`FKfq2AUUKWgubVtQ8ixyfR7zy5qEweqrzQrJqd2owoJb` holds **2.0416 devnet SOL** (worth nothing) and
**0 mainnet SOL**. Measured 2026-09-15.

This is the one that unblocks the most. With real Oro GOLD and real SPYx, the receipt page
names its assets, the ledger's numbers are derivable, the watcher runs against live
multipliers, and the demo stops being split across two chains. A mainnet deployment with real
Oro GOLD is worth far more to a judge than a devnet demo with stand-in mints.

### 2. The email door — needs an embedded-wallet app id

Privy or equivalent. Both doors resolve through one cookie, so it changes the route that
*issues* a session and nothing that reads one. Without it, D5 stands and most visitors see
only the landing page.

### 3. What the public ledger should show

Twelve test-battery transactions are on chain and currently render as the public record
(D11). Three options:

- **Leave them.** Honest, openable, and visibly synthetic.
- **Separate them** — mark test releases, or move the battery to its own program id, and let
  the public ledger start empty and fill with real payouts.
- **Seed it for real.** The strategy doc already says week one is seeded personally, the way
  Sage's first campaigns were. Real payouts to real people, with real reasons, are a
  different artifact entirely — and they start the 30-day keep-rate clock, which is the one
  number nobody else will have. **If the deploy happens, this is the answer.**

Note the timing: keep-rate needs **30 days** from first release. Started today, the first
honest keep-rate figure exists in mid-October.

---

# Part 8 — Verifying any of this

```bash
npm run lint && npm run typecheck && npm run test   # 242 pass, 16 skipped
npm run build                                       # writes .next-build, not .next
cd anchor && cargo test                             # 27 Rust unit tests

npm run test:registry   # reads every mint off MAINNET and checks the registry's claims
npm run test:valuer     # values a book against live Pyth
npm run test:devnet     # 8 tests through the deployed program
```

Maintenance — the watcher, the indexer and the cohort measurement, behind one secret:

```bash
curl -s -X POST http://localhost:3000/api/maintenance \
  -H "authorization: Bearer $WEBGOLD_MAINTENANCE_SECRET"
```

Switch chains with one variable in `.env.local` (`devnet` | `mainnet-beta`), then restart the
dev server — `NEXT_PUBLIC_*` is read at server start.

**The cache is a cache.** Until D1 and D2 land, `rm var/webgold.db*` after any cluster switch,
or you will be looking at the other chain's rows.

---

# Appendix

## Addresses

| What | Address |
| --- | --- |
| Program (devnet) | `3siGeKgHp7pvVVmjbdtBemeirNRPSFHyMXBJu3CXZ3hX` |
| Deployer | `FKfq2AUUKWgubVtQ8ixyfR7zy5qEweqrzQrJqd2owoJb` |
| Oro GOLD (mainnet) | `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A` |
| SPYx (mainnet) | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` |
| Pyth XAU/USD | `2UK6JWZKvqFwU7mAt76TePbtNn99MPzKMqZNq4DEPbCa` |
| Pyth SPYX/USD | `jf8MarLKgBte4f3NWufbNpGRCuBfJLhuZPuFigvSQR2` |

## Corrections this build made to its own spec

Four things the docs asserted that turned out not to be true on chain. All four are recorded
in `docs/decisions.md` and in CLAUDE.md's "Known drift" table:

1. **Silver failed the metal test.** No allocated-silver token on Solana has real depth.
   Default went 50/20/30 → **70/30**, by founder decision on the evidence.
2. **The live multiplier is `newMultiplier`, not `multiplier`.** Reading the obvious field
   paints every SPYx balance 0.18% short forever.
3. **Activation is 04:00 UTC**, not the documented 00:30. Nothing hardcodes an hour.
4. **Oro GOLD has no freeze authority and no permanent delegate** — which is why the
   disclosure is per-row and not a banner.

## Two bugs found in already-committed code, worth remembering

- **Anchor's Borsh coder encodes `0` for a field name it cannot find**, silently. `driftBps`
  instead of `drift_bps` had been writing a 0% rebalance band into every policy since build
  step 2 — accepted by the program, wrong forever, no error anywhere. Every encoder now
  round-trips in its test.
- **One token program per instruction cannot pay this product's own default mix.** Oro GOLD
  is classic SPL, SPYx is Token-2022. The token program is now per leg, checked against the
  mint's actual owner.

Both are the same shape as D1 and D2: **a value that exists in two places, drifting.** That
is this repo's dominant defect and it is worth assuming there is one more of them
undiscovered.

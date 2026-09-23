# Scrip

> Canonical spec. When code and this document disagree, **the code wins** — record real
> drift under "Known drift" at the bottom rather than quietly editing this file.
>
> Rewritten 2026-09-15 when Webgold became Scrip. The complete product is
> `docs/scrip.md`; this file is the short version, the architecture that binds it, and the
> standing policies. The repository directory is still `webgold`; nothing public says so.

---

## 0. Start here

Read in this order, then say what you are building:

1. this file
2. `docs/scrip.md` — the complete product: the rule, the intake, the program, the keeper,
   keep-rate, the words, the definition of done
3. `docs/SCRIP-COMPANY-PLAN.md` — the second transformation (2026-09-16): Scrip as a
   company that pays in ownership. It supersedes `docs/scrip.md`'s design section,
   presentation section and roadmap: the product map, the organisation side, grants, the
   floor, "There is no opening bell", the operating plan, the order by leverage
4. `docs/decisions.md` — settled questions. Reopening one needs a new fact, not a new opinion
5. `docs/build-order.md` — dependency order and where it stands
6. `docs/research.md` — every market and behavioural claim with a source
7. `docs/current-state.md` — what exists and what it does when you run it, observed

Before touching any user-facing surface, invoke the **`scrip-ui`** skill.

---

## 1. The product, in ten seconds

**Scrip is a rule on your wallet: a slice of every dollar that lands becomes stock, in the
same wallet, with a receipt.**

The recipient sets a rate once — 10% by default — on the Solana address they already use.
Payers keep sending USDC to that address exactly as they do today and never open Scrip.
Within seconds of an arrival, the slice is S&P 500 in the recipient's own token account, a
permanent receipt is written, and the chain records at 7 and 30 days whether it is still
held. Pausing the rule is a token-program `revoke`, which the program cannot prevent.

> Set a rate once. A slice of every USDC that lands in this wallet becomes S&P 500 in the
> same wallet. The payer just sent dollars.

The positioning line, everywhere the product is explained to a person:

> You're already getting paid. Investing shouldn't take another decision.

**Widened on 2026-09-16 to "get paid in ownership."** The rule is the person's side. The
organisation's side is the same program paying a person, a team or a grant in stock: one
signature, one receipt per line with its reason, an escrow the payer cannot spend. Scrip is
the first organisation on it: its bounties are paid in stock through `@scrip`.

**Five objects.** A rule (rate, asset, optional floor and cap) on the recipient's own USDC
account, held in a `Book` they own, enforced by the program, driven by permissionless
keepers. A receipt — a permanent on-chain account written in the same transaction as the
conversion, at `/receipt/<signature>`, measured at 7 and 30 days; five kinds: sweep, pay,
gift, grant, vest. A pay link, `/pay/<handle>` — the intake for attributed payments. A grant
— stock bought once into an escrow that vests on a schedule to a recipient, by keepers. A
public ledger — every receipt, keep-rate, and the floor: every stub as it prints.

**Words on surfaces.** The `Book` account is a person's **register** and an organisation's
**page** in every sentence a user reads; the code keeps `Book`. A receipt is a **stub** when
drawn. The chrome says **Pay in stock**, never "send".

**It is not** a trading terminal, a robo-advisor, a lender, a card, a social feed, a
launchpad, or a brokerage. It never decides amounts: the rate is the owner's, the price is
Jupiter's route bounded by Pyth, the timing is arrival. It gives no advice. It never holds
an asset across a slot. Gold is one option among several; it is not in the hero, the
default, or the pitch.

**The number that decides everything: keep-rate.** The share of what was converted that is
still held, measured on chain at 7 and 30 days from raw units. It cannot be faked, because
the denominator is the receipt's own `amount_raw` and the numerator is a balance the program
read from the recipient's own token account, by whoever called for the measurement.

## 2. Principles

1. **Non-custodial by construction.** The owner's USDC and the owner's stock sit in token
   accounts the owner controls. The program holds the rule and writes receipts. Pausing is a
   `revoke` the program cannot prevent.
2. **No model, no operator, and no program ever decides how much.** The rate is the owner's.
   The price bound is Pyth's, net of confidence. The route is the keeper's, inside the
   owner's tolerance. The timing is arrival.
3. **Every money moment prints a receipt** anyone can open, anchored to a real transaction.
4. **Never show a number we cannot derive from chain state.** No simulated balances, no
   projected returns, no fabricated activity. A worked example is labelled arithmetic.
5. **Savings-grade, not stable.** Equities fall. The UI says so.

## 3. Honesty requirements, non-negotiable in copy

- Every xStock carries a **permanent delegate** and a **pause authority**: the issuer can
  move, burn or freeze. Self-custody here means *not our custody*. Not offered to US
  persons; the owner attests eligibility at `open_book`.
- **Dividends are reinvested, not paid**, through a mint-level multiplier. Never show
  expected income.
- **The rule sees the net increase since the last sweep, never gross inbound.** The tagline
  may say "every dollar that lands"; the sentence beneath it, everywhere, is *Scrip invests a
  slice of your wallet's USDC inflows.*
- **Disclosure is per row, never a banner.** Oro GOLD has no freeze authority and no
  permanent delegate; a blanket warning would be false about it.

## 4. Architecture

### The program — `anchor/programs/scrip`, deployed to devnet

Anchor 0.31.1. The instruction set is exactly what is listed; anything not listed does not
exist. The program never CPIs Jupiter: swaps are top-level instructions in the same
transaction, and the program makes the transaction atomic around them with instruction
introspection.

| Account | Seeds | Holds |
| --- | --- | --- |
| `Book` | `["book", owner]` | owner, slug, asset, usdc_mint, the two Pyth feed ids, terms_version, the `Rule` (enabled, rate, escalation, floor, cap, min_inbound, tolerance, watermark, enabled_unix, sweeps), `pending`. Also the token delegate address; float lamports above rent |
| `Handle` | `["handle", slug]` | owner, `kind` (Person or Org) |
| `Payout` | `["payout", payer, release_id]` | the escrow's owner: payer, recipient, claimant, kind (Settle = pay, Sponsor = gift), reason_hash, declared_usdc, asset, min_out_raw, `run_id`. Exists exactly while open |
| `Grant` | `["grant", payer, grant_id]` | payer, recipient, asset, reason_hash, declared_usdc, total_raw, released_raw, release_cap_raw, start/cliff/duration, state (Open, Active, Revoked), vests, float. The escrow's owner while it vests |
| `Receipt` | `["receipt", book_or_payout_or_grant, release_id]` | kind (Sweep, Pay, Gift, Grant, Vest), recipient, payer, submitter, book, release_id, `run_id`, reason_hash, basis_usdc, rate_bps, paid_usdc, asset, amount_raw, price stamp, slot, unix, measured_7d, measured_30d |

Instructions: `open_book(slug, terms_version, kind)`, `set_asset`, `close_book`,
`enable_rule`, `set_rule`, `disable_rule`, `sync_watermark`, `withdraw_float`,
`begin_sweep`, `finish_sweep`, `fund_payout(…, run_id)`, `release_payout`, `claim_payout`,
`cancel_payout`, `open_grant`, `seal_grant`, `vest`, `revoke_grant`, `close_grant`,
`measure_receipt`. Depositing float is a plain system transfer to the Book or the Grant.

**The grant** — `[memo, open_grant, jupiter…, seal_grant]` in one transaction the payer
signs: the escrow is bought at once, then sealed with the float that pays for its vests.
`vest(release_id)` is permissionless: anyone may release what the schedule allows (linear
after a cliff, up to ten years), a Vest receipt is written to the recipient with the grant's
reason, and the caller is repaid the tip and the receipt's rent from the grant's float. A
Grant receipt records the purchase. `revoke_grant` caps releases at what has vested and
returns the rest to the payer; `close_grant` returns rent and float once nothing is owed.
Dividends reinvest into the escrow through the mint's multiplier while it vests.

**The sweep** — `[compute, begin_sweep, jupiter…, finish_sweep]`. `begin_sweep` requires
top level, exactly one `begin_sweep` in the transaction, and a `finish_sweep` for the same
book and release id at a later index; then computes the slice from on-chain state and moves
exactly that much USDC through the delegate to the keeper. `finish_sweep` requires the
owner's cash unchanged, a fully verified Pyth price for one of the book's two feeds under
600 s old with a confidence band under 1%, and a delta on the owner's asset account at or
above the min-out (through the live scaled-UI multiplier when the feed prices a share);
writes the receipt; repays the keeper the tip, the receipt's rent and any ATA rent from the
float. Any failure reverts everything, delegate transfer included.

**The registry** is compiled in (`registry.rs`) and mirrored in `src/lib/assets/registry.ts`;
a test reads both. The `devnet` feature accepts any asset and prices it by the SOL/USD and
USDC/USD feeds, which are pushed on devnet; the mainnet build refuses anything not on the
table and any pay-in mint but USDC.

### Off-chain

| Piece | Job |
| --- | --- |
| **Keeper** (`src/keeper/`) | watches every Book with the rule on; syncs the watermark after a spend; posts a fully verified Pyth update from Hermes when the on-chain one is stale; quotes Jupiter; submits the atomic sweep; vests every active Grant on a cadence (`KEEPER_VEST_HOURS`, first and final vests at once); reports health |
| **Intake builder** (`src/lib/intake/build.ts`) | one versioned transaction the payer signs: memo, fund, Jupiter into the escrow, release |
| **Indexer** (`src/lib/ledger/indexer.ts`) | mirrors receipts and books into the cache, incrementally with a cursor; attributes sweeps from transfer history; refreshes measurements |
| **Crank** (`src/lib/ledger/crank.ts`) | calls `measure_receipt` at 7 and 30 days |
| **Relayer** (`/api/claim/tx`, `/api/relay`, `/api/send`) | fee-sponsors claims so an empty wallet can take a first position; relays signed transactions that touch the program |
| **Organisation side** (`src/lib/org/`, `src/lib/grant/`) | `orgView`/`runView` over the cache; `resolveRecipient` (handle or address); the grant builder (memo, open, route, seal); the run builder signs many intakes with one `signAll` |
| **The floor** (`src/lib/floor/`, `/api/floor/stream`) | every receipt as it prints, the share that landed while the NYSE was closed, the corporate actions, over SSE |
| **Notify** (`src/lib/notify/telegram.ts`) | one Telegram message per receipt to a linked chat, when a bot token is configured |

### Data model — SQLite via drizzle, one file per cluster (`var/scrip.<cluster>.db`)

`books` (with `kind`), `receipts` (the account plus the signature, the verified memo, the
`run_id`, and attribution), `grants`, `runs`, `multipliers` (every rebase ever seen),
`cursors`, `intakes`, `telegram_links`. A cache of the chain, never a ledger of record.

### Stack

Next.js 15 (App Router, RSC by default), TypeScript strict, Solana web3.js + Anchor coders
(no Provider anywhere), Jupiter for routing, Pyth for the settle bound, Wallet Standard
(no adapter UI), drizzle + better-sqlite3, Vitest.

## 5. Routes

**Marketing (dark nav, paper body):** `/` the floor as the front door — the front book
printing live, the tape, the mechanism, the market band, the paper tear, the record;
`/people`, `/teams`, `/grants` the three doors; `/company` (the seven firsts, each linked to
where it happened), `/security` (what a stranger can check, read from the chain),
`/bounties` (Scrip's own, paid in stock), `/changelog`, `/brand`, `/actions` (corporate
actions from the mint); `/assets`; `/docs/*`.

**Public records (unshelled):** `/@handle` a person's register (opt-in) or an
organisation's page (people paid, runs, grants vesting); `/pay/[handle]` two ways, in stock
or in USDC; `/receipt/[sig]`; `/run/[id]` a payroll run, every line a receipt with its
reason; `/grant/[pda]` a grant and what has vested; `/claim/[payer]/[rid]`; `/ledger`;
`/keepers`; `/floor` the live tape. Each of `/@handle`, `/run`, `/grant` and `/receipt`
renders an `opengraph-image`.

**The register (shelled, the owner):** `/app` the moment, live; `/app/rule` one question,
one signature; `/app/holdings`; `/app/receipts`; `/app/statements` and `/app/statements/[ym]`
(a month as a document that prints); `/app/settings` (allowance, float, the public page,
Telegram). `/book/[handle]` redirects to `/@handle`.

**Pay in stock (shelled, the payer):** `/app/org` home; `/app/org/pay` one person, with a
split; `/app/org/runs` a run from a file, one signature; `/app/org/grants` open, revoke,
close; `/app/org/people`; `/app/org/settings` (an organisation handle, the public page,
export). `/app/send` redirects to `/app/org/pay`.

**⌘K** anywhere opens a field that resolves a handle, a receipt signature, a run id, a grant
address or a page name from its shape.

**API:** `pay/tx`, `pay/watch`, `solana-pay/[handle]`, `rule/tx` (open takes `kind`),
`rule/status/[owner]`, `book/live/[owner]`, `book/publish`, `market`, `handle/[slug]`,
`claim/tx`, `relay`, `send`, `org/{pay,run,grant,grant/action,export}`, `me/export`,
`floor/stream`, `notify/telegram/{route,webhook}`, `session/*`, `maintenance`. Icons and
the manifest are routes: `/icon`, `/apple-icon`, `/icon-512.png`, `/manifest.webmanifest`.

## 6. Design system

"There is no opening bell." Two materials by surface: ink (the dark ground) for the floor —
the front door's opening and close, the tape, the printer, the market band; paper `#f7f5ef`
for every document — the register, receipts, statements, the pay page. Ink `#14161c`,
document blue `#2b4acb` on every interactive element, green and red for money outcomes only,
gold for the GOLD chip only. Instrument Sans for words, IBM Plex Mono for figures, Fraunces
in exactly two places: the wordmark and a statement's title line. The stub is the one bold
object and comes in five sizes. Full contract in `src/styles/tokens.css` and the `scrip-ui`
skill.

## 7. Standing policies

- **Money-critical code requires tests**: the slice formula, the min-out, the introspection
  guard, the multiplier conversion, the intake builder, the memo hash, keep-rate
  deduplication. `lint` + `typecheck` + `test` green before anything ships.
- **Two lists that drift is the dominant defect shape.** Whenever a value is declared in two
  places, write the test that reads both: the program id (three places), the registry (Rust
  and TypeScript), the rule constants, the rail and the shell, the docs nav and the pages.
- **Never invent a number on a surface.**
- **Disclose the issuer** on every asset row.
- **Failure returns a value.** `Outcome<T>`; nothing throws for control flow.

## 8. Commands

```bash
npm run dev            # next dev --turbopack
npm run build          # writes .next-build, never over a running server
npm run lint
npm run typecheck
npm run test           # the offline suite
npm run anchor:test    # the program's unit tests, both builds
npm run anchor:build   # mainnet build + IDL sync
npm run anchor:build:devnet
npm run test:devnet    # the on-chain battery (19 tests) against the program at NEXT_PUBLIC_SOLANA_RPC
npm run test:localnet  # the same battery on a local validator with Pyth's accounts cloned (scripts/localnet.sh)
npm run test:registry  # every mint and pinned feed, read off mainnet
npm run keeper         # the keeper
npm run demo:devnet    # setup | land <usd> | sweep | sign | status — the whole moment on devnet
npm run book           # start | status | publish — a book from a keypair, any cluster
npm run preflight      # what a deploy would cost and what is missing, read from the chain
```

---

## Known drift

| This file / docs say | The code does | Why |
| --- | --- | --- |
| `docs/scrip.md` §5.2 lists `deposit_float` | there is no such instruction; a system transfer to the Book is the deposit | A program-owned account receives lamports from anyone; an instruction would add code with no rule in it |
| §5.1 gives `Payout` a `state` field | there is none; a Payout exists exactly while it is open | Release, claim and cancel all close it, so a state field could only ever read "open" |
| §5.1 gives `Receipt` an `Option<PriceStamp>` and `Option<u64>` measurements | fixed-size `PriceStamp` (all-zero feed = none) and `Measurement { at, balance_raw }` (`at == 0` = none) | A fixed layout is what a stranger can decode from an offset; the TypeScript reads the zero as absent |
| §5.1 names one feed per asset | the Book carries TWO feed ids, `feed_raw` and `feed_adjusted`, and `finish_sweep` applies the multiplier only for the adjusted one | Pyth's `Crypto.SPYX/USD` prices the raw token and is pushed around the clock; `Equity.US.SPY/USD` prices a share in market hours. Accepting either keeps the rule alive on weekends and honest on weekdays |
| §5.2 has no `sync_watermark` | it exists, permissionless | A sweep that finds nothing to sweep reverts, so a watermark lowered inside `begin_sweep` never persists; without it a spend would hide the next arrival. It can only ever set the watermark to the true balance, and only downward |
| §5.3 posts the Pyth update inside the sweep transaction | the keeper posts it in preceding transactions, fully verified, then sweeps | Full verification takes several transactions; the atomic post is partially verified and the program refuses partial. The program only needs a fresh, fully verified account to exist |
| §7.1 has `/claim/<release_id>` | `/claim/<payer>/<release_id>` | A Payout is addressed by payer and release id; the URL carries both. The claim secret stays in the fragment |
| the docs say `/api/rule/status/<owner>` reads "keeper health" from a service | it reads `KEEPER_HEALTH_URL`, the keeper's own health endpoint | The keeper is a separate process; the app reads what it reports |
| §6 says Scrip runs two keepers | it does, since 2026-09-18: `scrip-keeper` and `scrip-keeper-2` on the VM, different keys, health on 8787 and 8788, and `KEEPER_HEALTH_URL` takes a comma-separated list so `/keepers` names both | Two keepers racing is the only proof that a keeper is permissionless rather than an operator |
| §4 "every field read off mainnet" | mint facts, feed ids and depth figures were read on 2026-09-12 and 2026-09-15; only four Pyth accounts are pinned on chain | The other feeds' sponsored accounts were not located without `getProgramAccounts`; the keeper posts its own updates, so a pin is a convenience, not a dependency |
| the program is deployed to devnet only | **Scrip is on Solana mainnet since 2026-09-21**, program `Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj`, programdata `8agi582Xfi2cMBrQ4Tmb5JwAeDARhmigRgcezKiur12B`, slot 449,071,806, 585,384 bytes, sha256 `92f9cbda…` — dumped back off the chain and compared byte for byte. The deploy cost **2.978549209 SOL**, matching the devnet measurement to the lamport. The upgrade authority is `5ADHnjdRMhHeACcfNR2Kgor5REDdgjkHZiA1NXtYSspy`, which exists only on the founder's machine | `--with-compute-unit-price 20000` was refused: the CLI's own fee ESTIMATE (0.0202 SOL) is charged against the balance even though the real cost at half that price was 0.000172. 10000 fits inside 2.99 and lands in 26 seconds |
| §7 keeps the cache at `var/paidin.<cluster>.db` | `var/scrip.<cluster>.db` | The name |
| the docs describe turning on as open, then approve + float + enable | `start` does all four in ONE transaction, one signature | The program never required two; the first UI did. A person answers one question and signs once |
| nothing in the docs says a book is public | a book is private; `/book/<handle>` exists only after the owner turns it on (`books.published`, off chain, reversible) | Chain data is public, but a savings product should not be the surface that makes somebody's arrivals searchable by name unless they chose it |
| the docs show the worked example as a table beside a real stub | where no receipt in a registered asset exists, the worked example IS the stub, drawn as the same object and labelled "a worked example, not a receipt" | One object on the front door; never a sample number that reads as a settlement |
| a mint off the registry is "held" | on devnet it is read from the chain and labelled **stand-in** (symbol, decimals, program from the mint); on mainnet it stays held | The e2e battery and `scripts/devnet-demo.ts` mint stand-ins; every surface that meets one says what it is instead of printing raw units |
| the mainnet `.so` needs "about 3.3 SOL", or 6 SOL counting the buffer | **2.978378 SOL, measured**. Proved on devnet on 2026-09-19 by funding a throwaway payer with exactly 2.9794 SOL and deploying the real 585,384-byte `scrip-mainnet.so` at `--max-len 585384`: it landed in 18 seconds and left 0.00102232 SOL, and the dumped bytes matched sha256 `92f9cbda…`. The split is 2.974630 programdata rent, 0.000833 program-account rent, 0.002915 base fees (582 transactions, 583 signatures). `--with-compute-unit-price 10000` added 0.000172. The buffer is **not** a second 2.97 SOL: `DeployWithMaxDataLen` moves its lamports into the programdata, so peak equals total | The founder is buying this SOL with liquidated capital, so the figure had to be measured, not estimated. Both rents are a deposit: `solana program close` returned 2.97462956 SOL, twice, in the same test |
| nothing says what a sweep costs, or who pays it | a sweep costs the **register's float** `KEEPER_TIP` 500,000 lamports plus the receipt's rent 2,519,680 (368 bytes at 5,080), so 0.00302 SOL. The keeper is repaid both and ends each sweep about 489,000 lamports ahead, measured. A register's own rent is 0.002459 and its handle's 0.000864 | The keeper is not a cost centre; it is paid. The cost that scales is the receipt's rent, and it stays spent, because a receipt is permanent |
| `npm run anchor:build` builds the mainnet program | it also copies it to `anchor/target/deploy/scrip-mainnet.so`, which is the file the runbook deploys and `/security` hashes. Until 2026-09-17 it did not, so that file was three days stale and would have put a pre-grant program on mainnet | A build that does not produce the artefact its runbook names is a trap with one victim |
| `docs/deploy.md` §6 proved mainnet with `npm run test:devnet` against it | that battery mints its own stand-ins, which the mainnet build refuses by design; §6 is now five ordered steps with real money in small amounts | The refusal is the feature; the proof has to respect it |
| `docs/scrip.md` §7.1 shows the front door as copy beside one stub | the front door is the product running: a published book (`NEXT_PUBLIC_FRONT_BOOK`) prints live under a printer, with a Solana Pay QR on mainnet, and the market on Solana ticks beside it | The founder's review: "well-built generic". A judge must see money land and stock print without being told about it |
| nothing in the docs reads a price for display | `src/lib/market` reads Jupiter's price and token APIs (keyless) and the mint's multiplier from mainnet, cached 30 s, for the front door only | Display, never settlement: a sweep still settles against Pyth on chain, and the band says so |
| §7.1's pay page has one form | two ways: in stock (the intake) or in USDC (a Solana Pay transfer request to the normal address, no Scrip transaction) | "Payers never open Scrip" deserved a button: the USDC way IS that sentence |
| `/app/request` and `/assets` in the rail | the request page is gone (the pay link takes `?amount=&reason=`); `/assets` stays but leaves the rail; `/keepers` joins it | Fewer pages that are forms; one page that is Solana-native infrastructure |
| §9 "one moment of motion … nothing fades up on scroll" | the front door is a film: every scene's real object enters when reached, figures roll to their real values, the last sweep replays from its receipt, the tape moves; app surfaces keep the one moment | The founder's third review: "cinematic and motion animated … every scroll should be visually amazing". Motion is spent on real objects and real figures, never on text, and collapses under reduced motion |
| §9 "no dark close"; one dark surface | the front door opens and closes dark (the floor at night), with `--accent-inverse`, `--ok-inverse`, `--err-inverse`, `--ink-inverse-faint` and `--glow` added to tokens; every document surface stays paper | The paper-and-ink identity read as tasteful and anonymous; the dark opening gives it contrast, and the tear between the two is the stub's own perforation |
| §7.2 the rule page asks for a wallet first | the question is answered signed out; the wallet is asked for at the moment of signing; the answer survives the popup in session storage | Onboarding: see the value, then sign |
| nothing in the docs says where Scrip runs | **`https://scrip.work` on mainnet** since 2026-09-21, on the founder's VM beside other apps, under pm2 and nginx; `www.scrip.work` and the old `scrip.80.225.209.190.sslip.io` share the certificate. `deploy/ecosystem.vm.cjs`, `docs/deploy.md` §0 | The demo has to be reachable from a phone before it can be judged from one — and Phantom blocks a raw-IP sslip.io host outright as a phishing shape, which made a real domain a functional blocker rather than branding |
| `docs/scrip.md` §7.2 asks for a wallet first; §7.1 has `/book/<handle>`, `/app/send`; no organisation, no grant | `docs/SCRIP-COMPANY-PLAN.md` (2026-09-16) supersedes the design, the presentation and the roadmap: `/@handle` for people and organisations, `/app/org/*` to pay in stock, `Grant` in the program, the floor, the marketing map, Telegram, ⌘K, statements, OG images on every public record | The founder: Scrip becomes a company that pays in ownership; "start now according to the plan, mainnet at the end" |
| the plan's §5 names `ReceiptKind { Sweep, Settle, Sponsor, Grant, Vest }` and `Handle.kind` | `ReceiptKind { Sweep, Pay, Gift, Grant, Vest }`; the IDL keeps the Payout kinds `Settle`/`Sponsor`, which TypeScript maps to `pay`/`gift` | The words a person reads on a stub; the account layout is what the plan asked for |
| the plan's §5 has `vest` repay "from the grant's float" and the keeper vest "hourly" | the float is set at `seal_grant` (50,000,000 lamports suggested, refunded at close); the keeper vests on `KEEPER_VEST_HOURS` (default 24), the first and final vests at once | A grant of $50 vesting hourly for a year would spend more in tips than it is worth; a day is the cadence a person can see on their register |
| the front book on devnet is `@demo`, a person | the grant build is **on devnet** since 2026-09-16 (slot 499,325,517, 581,024 bytes, sha256 `87ab6122…`), and the front book is `@scrip`, an **organisation** opened by `npm run demo:devnet -- setup` with `DEMO_SLUG=scrip DEMO_KIND=org`. The 2026-09-15 `@demo` register and its receipts were written by the old layout and no longer decode; the indexer skips them and the old cache is set aside at `var/old/` | Two account layouts cannot share a cluster. A redeploy is the only way to read the new ones, and the front door must show what the code actually writes |
| nothing in the docs limits how fast Scrip reads the chain | every server read passes `src/lib/solana/limiter.ts`: one gate per endpoint per process (on `globalThis`, so a dev server's several module copies share it), 4 calls a second and 2 at once on Solana's own endpoints, 100 on a paid one, unlimited on a local validator; rent lookups are cached by size in `src/lib/solana/rent.ts` | The public endpoint answers a burst with 429 and the page then has no number to show. A queue is slow; a refused read would be a wrong number |
| §9 "one moment of motion"; `<Reveal>` watches with an IntersectionObserver | it is a scroll check: a scene enters when its top crosses the bottom of the window, which is also true of anything scrolled past. An observer missed any scene jumped over, and six were invisible after one flick to the end of the page | Content hidden by default must be revealed by a mechanism that cannot fail to run |
| nothing in the docs says what happens with JavaScript off | the front door renders whole; the film's hiding lives under `:where(html[data-js])`, stamped in the head before first paint | A crawler, a scripting-off browser and the moment before hydration are all readers |
| a `PYTH_API_KEY` makes the keeper able to refresh any feed | **US equities are not in any affordable tier.** Measured with a real key on 2026-09-21: `Crypto.USDC/USD` 200, `Metal.XAU/USD` 200, `Equity.US.SPY/USD` **403 not entitled**, `Crypto.SPYX/USD` **403**. Free is view-only, Starter ($500/mo) is crypto symbols, equities are Pro ($2,500/mo). But the program reads an **on-chain account**, which is permissionless and free: `Equity.US.SPY/USD` measured at 7 s old, fully verified, 0.002% band on mainnet. So SPYx settles free on weekdays and Hermes is never called; the key only buys a fallback | Paying $500 would buy weekend coverage through the 24/7 token feed, and $2,500 would not buy a better weekday. Neither is worth it: **no oracle at any price has an S&P 500 price on a Saturday**, because the market is closed. The gap is structural to equities, not a tier |
| a stale price is the keeper's business | it is now the register's: `src/lib/book/waiting.ts` turns the keeper's own `waiting for a fresh price` into a sentence on `/app` and on the public register, whenever money is unswept. It names the amount and the asset and refuses to guess *why* the price is absent, because the chain only proves that it is | Money landing on a closed market, with the surface saying nothing, reads as a product that stopped. The program refusing to settle without a verifiable price IS the thesis; it had to be visible |
| the keeper reads "the book's raw feed" | it tries **both** of the book's feeds, pinned account first for each, then Hermes for each. Found on mainnet the hour of the deploy: `priceFor` only ever read `asset.feedRaw`, so with `Crypto.SPYX/USD` nine days stale on chain and 403 on any affordable Hermes plan, the keeper could never have swept SPYx on mainnet at all — while `Equity.US.SPY/USD` sat seven seconds old and free | The program has always accepted either feed; that is why a Book carries two. The keeper was the half that only knew about one. The devnet feature prices everything by SOL/USD, so the adjusted path had never once run |
| `minOutRaw` is called with `multiplierE12: null` | null only when the feed prices the token. When the keeper settles against `Equity.US.SPY/USD`, which prices a SHARE, it reads the mint's live scaled-UI multiplier and converts with `decimalToE12`, matching what `finish_sweep` does on its side. `multiplierToE12` goes through a JS number and cannot carry 1.005714560286254; `decimalToE12` is integer arithmetic and truncates, never rounds up | A min-out in the wrong denomination is not a safety hole — the program checks the delivered amount itself — but it either submits a doomed transaction or refuses a fill the program would have taken |
| the relayer signs a claim when it is built (`/api/claim/tx`) | **the wallet signs first, the relayer last.** Phantom blocked every claim on scrip.work, and its support named the cause: the transaction reached the wallet already carrying the relayer's signature, so Phantom's Lighthouse guard could not add its assertions and flagged it. Now `/api/claim/tx` returns the claim unsigned; `/api/relay` rebuilds it from the same parameters (`src/lib/claim/build.ts`, the one definition) and co-signs only if every instruction is exactly that claim or a Lighthouse assertion (`src/lib/claim/verify.ts`) | A signature that was safe by construction had to become safe by inspection: signing last without a check would let anyone attach a transfer out of the relayer. Lighthouse is allowlisted by discriminator from its own generated client — assertions 2–15 accepted even when they name the relayer (Phantom guards the fee payer too, as CoW Protocol found, `cowprotocol/services#4960`); MemoryWrite and MemoryClose refused, because each names a payer for rent |
| a claim carries only Scrip's instructions | it carries its own **compute budget** (300,000 units at 20,000 microlamports, 6,000 lamports to the relayer), and the relayer bounds any budget that comes back at 100,000 lamports. Phantom adds a priority fee to every transaction that reaches it unsigned and without one — in `signTransaction` too (`docs.phantom.com/developer-powertools/solana-priority-fees`) — so the first claim after the order was fixed came back with four instructions where two were built | The claim is the only transaction Scrip pays for, so it is the only one Scrip re-checks. Rule, pay, the pay link, grants and runs are signed and sent by the wallet itself; whatever Phantom adds there, the user pays |
| a claim is sponsored | sponsored **when the relayer can pay**, and the claimer's own otherwise — decided per claim from both balances, with a 9,000,000-lamport floor (the cost plus Solana's 650,240 rent minimum for a wallet). The program always allowed it (`OpenBook.payer`: "the owner, or a relayer"; `ClaimPayout.fee_payer`: "a relayer, or the claimer themselves"); the site never offered it, so an empty relayer made every claim a dead end. A self-paid claim is ONE signer and Phantom sends it natively; proven on devnet, 7,360,840 lamports with a register opened | A relayer running dry mid-demo, in front of the people claiming, was the likeliest way for the first real users to fail |
| the craft list is "to do" | built: one toast for every money action (`components/toast`), a skeleton per shelled route, `error.tsx` / `not-found.tsx` / `global-error.tsx`, an offline register and an install prompt (`components/app/offline.tsx`, `public/sw.js`), OG cards on `/pay/[handle]` and `/m/@handle/<id>` | Plan §9's "Craft, per page, before it is done" |
| nothing says how long a bring-up takes | `npm run rehearse` runs the mainnet sequence against a local validator, timed: 88 seconds from nothing to a site printing receipts, every step green (`docs/deploy.md` §6.1) | A deploy day should be a repeat of something already done, not a first attempt |


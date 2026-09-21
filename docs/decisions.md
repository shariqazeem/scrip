# Decision log

Written so that a future session does not re-open a settled question. If you want to
change one of these, bring a **new fact**, not a new opinion.

## 2026-09-12 — Locked: Webgold, the account for on-chain real assets

**Decision.** Build the consumer front door for tokenized stocks and metals on Solana. An
account that holds a fixed default mix in the user's own wallet, keeps it correct through
corporate actions, earns where it can, and can be paid into.

**Why this and not the alternatives.**

| Rejected | Reason |
| --- | --- |
| Trackrecord — verified portfolios, cards, one-tap copy | Founder is not a trader and would not use it; the graph dies the week creator payments stop; Dub already owns copy trading with $30M raised |
| Webgold as "savings app with APY" | Superform (Base) and apys (Solana) both shipped earn-on-stocks in the same week. Yield is a feature, not a wedge |
| Permissionless index/ETF factory | Contested: Symmetry has 350+ baskets, Reserve is porting DTFs to Solana, Lore Mag7 and basketsolana exist. Index Coop fell from ~$44M to ~$14M, which is evidence the demand is supply-side, not consumer |
| "Get paid in stocks" / Earned / payroll | Correct economics, but it is Sage's distribution wearing a new asset, and it makes the founder's wallet the growth engine permanently |
| Programmable capital wallet, x402 stock rails, Shopify-for-stock-apps | Infrastructure with no Tuesday job. x402 equity data is already claimed by x402stock and Massive; agent trading by xStocker |
| Trading agent under a mandate | Lost twice, on two chains |

**The reasoning that ended the rotation.** Neither of the founder's wins came from a novel
idea. ParallaxPay won by being early to x402; Sage won on real payouts and growth metrics,
which he has said himself. Stocklana offers no early advantage — everyone starts the same
Friday with the same issuers and the same twenty-one public repos. So the selection
criterion is **usage velocity plus company shape**, not novelty. Front doors take markets;
features get absorbed.

## Locked sub-decisions

| Question | Decision | Why |
| --- | --- | --- |
| Custody | Constituents in the **user's own wallet**; the program holds policy and receipts only | A pooled claim on tokenized securities is a fund; direct ownership is not |
| First build | The corporate-action watcher | Hardest correct thing in the category, and everyone else will get it wrong |
| Wedge | Sponsored first position, funded by issuers | Matching is the best-evidenced acquisition device in consumer finance; the budget already exists on the issuer side |
| Which asset leads the pitch | The market leads, metals stabilise | The competition is named after equities; gold is the differentiator, not the headline |
| Yield in v1 | Yes, but never the headline | It is the answer to "why not three Jupiter swaps", not the pitch |
| Issuers in v1 | One equity family, one metal family, both disclosed | Four wrappers with four legal shapes is a v1 that cannot be explained |
| Name | Webgold | The founder's own note, months old, and it survives past this hackathon |

## 2026-09-12 — Sign-in and ledger privacy (resolved)

**Both doors from day one: browser wallet and Privy email.** A wallet-only product is
untestable on any device without an extension, which includes the phone and the Safari
window a judge will open. The email door mints an embedded Solana wallet and the same
session a wallet sign-in would; the reserve, the policy and the positions are identical
either way. Nobody is asked which they are before they can see the product.

**The public ledger shows aggregates and an event stream, never a browsable per-person
balance.** Totals, reserves opened, payments settled, value held. Every receipt stays
public because it is anchored to a transaction that is already public, and an individual
reserve page is opt-in for anyone who wants one. Chain data is public; a product should
not build the surface that makes someone's net worth searchable by name. A savings product
that leaks balances by default loses the exact user it is for.

## 2026-09-12 — Silver failed the metal test. The default mix is 70 gold / 30 market

**Decided by the founder, on evidence, in the session that built the asset registry.** The
product law already required this check: *"Silver needs the same test as gold. If the only
liquid silver on Solana is a fund tracker rather than metal, then silver either moves under
funds or leaves the default mix. Verify before shipping the default 50/20/30."*

**The verification.** Every silver instrument on Solana mainnet, checked through Jupiter's
token API and by reading the mint accounts, 2026-09-12:

| Token | What it actually is | Liquidity | Holders |
| --- | --- | --- | --- |
| `SLVon` iShares Silver Trust (Ondo) | a **fund share**, ~$59 ≈ the SLV ETF | ~$48k | 887 |
| `SLVx` iShares Silver Trust (xStocks) | a **fund share** | ~$1 | 310 |
| `XAGx` "Silver XStock" | not a real listing | ~$1 | 3 |
| `AGon` First Majestic Silver (Ondo) | a **miner's equity**, not metal | $0 | 6 |

There is no allocated-silver token on Solana with meaningful depth. The rule that stops GLDx
(~$398, the price of a GLD ETF share, not of an ounce at ~$4,365) being called a gram stops
SLVon being called an ounce.

**The decision.** Silver leaves the default mix and moves under funds on `/assets`, holdable
by anyone who wants it and clearly labelled a fund share. The 20% goes to gold, holding the
70:30 metal-to-market ratio the original mix expressed. **The default is 70% gold, 30% the
market.** The home screen keeps two honest units — grams and share-equivalents — instead of
gaining a dishonest third.

## 2026-09-12 — Resolved: which issuer family for each sleeve

Answers the open question *"Which equity family and which metal family for v1, given the
wrappers differ?"* Both were settled by reading the mints, not by preference.

**Gold is Oro GOLD** — `GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A`, 6 decimals, one troy
ounce per token, ~$372k liquidity and 10,670 holders. The law said "Oro GOLD or Matrixdock
XAUm, whichever Jupiter can actually fill at launch", and that rule selects: XAUm carries
~$43k, roughly a ninth of the depth.

It is also, by some distance, the cleanest asset in the registry. Read off the mint: a plain
SPL Token mint, **freeze authority null, no permanent delegate, no transfer hook, no
extensions at all.** Once it is in a wallet, nobody — not the issuer, not us — can move or
freeze it. PAXG is deeper (~$590k) but carries a permanent delegate *and* a transfer fee;
XAUt0 carries a freeze authority. Oro was the named candidate and is the better asset.

**The market sleeve is SPYx** — `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W`, 8 decimals,
~$4.3M liquidity, ~70,000 holders. Confirmed by reading the mint to carry every extension the
architecture doc predicted: `PermanentDelegate`, `PausableConfig`, `ScaledUiAmountConfig`,
plus `TransferHook` and `ConfidentialTransferMint` both present with the hook program set to
the system program — reserved and disabled, exactly as described.

**Consequence for the copy: the disclosure is per-row, not a banner.** A blanket "the issuer
can move, burn or freeze" would be *false* about the gold sleeve, and a false warning is the
kind of lazy honesty that reads as dishonesty the moment somebody checks. Each asset row
states what is true of that mint.

## 2026-09-12 — Correction to the spec, from chain state: which multiplier is live

`docs/research.md` says a multiplier is "published before each ex-date, activated 00:30 UTC
the day after". Two things about that are wrong in ways that matter, both found by reading
the SPYx mint rather than the docs:

1. **The live value is not the field named `multiplier`.** The ScaledUiAmount extension keeps
   the OLD value in `multiplier` and the newer one in `newMultiplier`, with a timestamp. On
   2026-09-12 SPYx read `multiplier = 1.003909240011759`, `newMultiplier = 1.005714560286254`,
   effective `1781755200` — **three months in the past**, so the live multiplier was the
   "new" one and reading the obvious field paints every SPYx balance 0.18% short, forever,
   with nothing about the reading looking wrong. This is the corporate-action bug in its
   quietest form: not a crash, not a missing feed, a plausible number from the wrong field.
2. **The observed activation is 04:00:00 UTC, not 00:30.** Nothing in the code hardcodes an
   activation hour — the timestamp on the mint is the only authority. A boundary we cannot
   verify would be an invented fact doing real work.

A third finding, in our favour: both values are published *before* the change activates, so a
pending corporate action is visible in advance and a snapshot taken before an activation still
values correctly through it.

## Revenue (v1 intent)

Three lines, in order of how much they matter, and none of them is a management fee — a
fee on a balance is a drag on the one promise a savings product makes.

1. **Issuer distribution.** Issuers pay per acquired holder. This is the sponsored first
   position, and it is the only line that is both differentiated and already budgeted on
   the other side of the table.
2. **Yield share.** A cut of the yield routed through lending and leasing. The user never
   sees money leave, and it scales with value held rather than with churn.
3. **Conversion spread.** A small spread when USDC becomes the mix. The competitive norm
   (Glider charges 0.30% of automated volume, 0.50% manual, no management fee).

The pay rail is deliberately free. It is the growth loop, not a revenue line.

## Open questions

- Sponsor outreach timing: before there are holders, or after?
- ~~Which equity family and which metal family for v1~~ — settled 2026-09-12 by reading the
  mints: Oro GOLD and SPYx. See the entry below.

## 2026-09-12 — FINAL LOCK: Webgold, ownership you receive

**Decided by the founder after evaluating every alternative in this thread.** The deciding
factor was not analysis. It was the only concept he would promote happily and use himself,
and founder conviction outranks a model's ranking at this point. No further idea search.
The instruction on record: *"Do not ask another model what to build instead. Ask how to
build this better."*

**The product.** One book. Grams on the home screen, an equity sleeve one tap inside. Three
inlets — earn, receive, sponsor — and every arrival carries a named, openable receipt.

**Why each rejected alternative stays rejected:** trading and copy products fail the
founder-uses-it test; a generic savings account fails the "why not Binance" test; privacy
as the pitch depends on an issuer flip we do not control (xStocks has Confidential Balances
initialized but disabled, and it cannot run alongside the transfer hook they also
reserved); borrowing against the book is a real idea but ships as a later module, not as the
identity of the app.

**The boundary that keeps this from being Sage:** Webgold settles, it does not judge.
Payouts carry a reason string; verification lives elsewhere. Sage becomes a customer.

**The number:** keep-rate at thirty days. Instrumented from the first payout, because a
cohort that was not recorded cannot be measured later.

**Honesty requirements, non-negotiable in copy:** xStocks carry a permanent delegate and a
pause authority, so the issuer can move, burn or freeze. Self-custody means not our custody.
Dividends are reinvested, so never show expected income.

## 2026-09-12 — Product law: the three calls, and no Sage dependency

**Gold is metal.** Oro GOLD or Matrixdock XAUm, whichever Jupiter can fill at launch, priced
against Pyth XAU. GLDx is a fund share and may never be labelled a bar; if listed at all it
sits under "gold funds", never under grams. **The same test applies to silver** — if the only
liquid silver on Solana is a tracker, silver moves under funds or leaves the default mix.

**The market sleeve is SPYx.** The receive layer turns income into metal plus the market, not
a single-name bet. Other xStocks are holdable; NVDAx is a recipient's choice.

**Inbound value follows the recipient's policy**, default 50 gold / 20 silver / 30 SPY. The
payer may constrain the asset set, never the weights. Named gifts stay named; only
unspecified value converts.

**Sage is not a payer and not a dependency.** My earlier framing was wrong, for a reason that
settles it: Sage settles on GOAT, Starknet and Arc, not Solana, so making it pay into Webgold
would mean rebuilding another product's settlement layer on a third chain. Worse, a pitch that
needs a second product explained is a weaker pitch. The boundary — Webgold settles, it does
not judge — stands on its own and is what makes Webgold useful to **any** payer. What carries
over from Sage is craft, never coupling.

**No versions.** The target is the complete product by 12 October. `docs/build-order.md` is
dependency order, not a version ladder, and nothing on it is optional.

## 2026-09-15 — Webgold became Scrip: the rule is the product

**Decided by the founder, in `docs/scrip.md` (written as "Paidin", renamed Scrip on the
same day).** Webgold asked the payer to already hold GOLD and SPYx, put 70% metal in a
stocks hackathon, and read as a protocol. Its true insight — ownership can arrive in a wallet
the recipient already has — survives with the intake asset changed to what payers hold
(USDC), the default changed to what the hackathon is about (SPYx), and the arrival changed
from "a payer used our escrow" to "money landed, as it always does".

The settled decisions are the table in `docs/scrip.md` §13. What follows are the facts
found while building it, recorded so they are not re-litigated.

### The name

Scrip: a certificate entitling the holder to something; a scrip dividend is a dividend paid
in shares instead of cash. The product is income paid in stock. The word is old, short, and
already means the thing.

### Hermes requires an API key, and the on-chain SPYX account is not kept fresh

Measured 2026-09-15: `hermes.pyth.network/v2/updates/price/latest` answers 401 without a
key (Pyth's docs: required since 2026-08-26, `Authorization: Bearer`). The sponsored
on-chain `Crypto.SPYX/USD` account, `jf8Mar…`, was 234,350 seconds old — sixty-five hours.
Consequence: the keeper posts its own fully verified update from Hermes when the on-chain
one is older than the program's bound, and `PYTH_API_KEY` is a requirement of running a
keeper on mainnet, not an option. A stale feed pauses sweeps; nothing is lost by waiting.

### Two feeds per asset, and the Book carries both

Pyth's `Crypto.SPYX/USD` prices one raw token as it trades, multiplier included, around the
clock. `Equity.US.SPY/USD` prices one share, in market hours. The Book stores both feed
ids; `finish_sweep` accepts either, decides which it was given from the feed id on the
account, and divides the minimum by the mint's live multiplier only for the share feed.
This is the multiplier finding from Webgold, now enforced on chain rather than only
displayed.

### Activation hours vary; the timestamp on the mint decides

Webgold recorded one activation at 04:00 UTC and called the issuer's documented 00:30
wrong. Read across fourteen xStocks mints on 2026-09-15: SPYx activated at 04:00, NVDAx,
AAPLx, GOOGLx and MSFTx at 00:30, QQQx and METAx at 23:55 the day before. Both earlier
statements were one sample each. Nothing in Scrip assumes an hour.

### Full verification, not the atomic post

Pyth's atomic post is one instruction but partially verified. The program requires
`VerificationLevel::Full`, so the keeper writes and verifies the encoded VAA over several
transactions and then sweeps; the sweep transaction only needs a fresh, fully verified
account to exist. Recorded as drift from `docs/scrip.md` §5.3, which drew the post inside
the sweep.

### A 4 KiB stack frame, found on devnet

The first devnet deploy passed every small instruction and failed every large one: a
`require_keys_eq!` printed a "claimer" of `111118Bbj…`, thirty-two bytes that decode to
stack garbage, and `release_payout` died with an access violation at an address outside
every VM region. Anchor materialises every deserialized account on the frame; contexts with
a dozen accounts overflowed it. Every heavy account is now `Box`ed. The battery went from
five passing to eleven.

### `sync_watermark` exists because a sweep that finds nothing reverts

The spec lowered the watermark inside `begin_sweep` when the balance fell. But a sweep with
nothing to sweep fails on `InboundBelowMinimum` and reverts, so the lowered watermark never
persisted, and an owner who spent $700 would see nothing convert until the balance climbed
back past the old mark. `sync_watermark` is permissionless because it can only ever set the
watermark to the true balance, and only downward.

### The registry: eleven single names, by depth

Jupiter on 2026-09-15, liquidity and 24-hour volume: CRCLx $2.29M / $11.2M, NVDAx $1.72M /
$7.2M, MSFTx $0.55M / $5.3M, GOOGLx $0.44M / $3.1M, TSLAx $1.20M / $2.5M, METAx $0.25M /
$2.4M, AAPLx $0.72M / $2.4M, AMZNx $0.24M / $1.8M, MSTRx $0.79M / $1.8M, COINx $0.58M /
$1.7M, HOODx $0.50M / $1.4M. SPYx $3.69M / $27.4M; QQQx $1.68M / $3.4M; GOLD $0.38M /
$0.28M. Every mint read off chain the same day; every one carries the same extension set.
Single names are a choice, never a default.

### The devnet build accepts any asset

There is no USDC, no SPYx and no Jupiter on devnet. The `devnet` cargo feature makes
`open_book` accept any mint and price it by SOL/USD and USDC/USD, which are pushed on devnet
at the same addresses as mainnet; any six-decimal classic mint may stand in for USDC. The
mainnet build compiles the registry in and refuses anything else. A Rust test asserts the
mainnet table has no test entry. This is the same category of decision as Webgold's refusal
to register a fake Oro GOLD on devnet, resolved the other way: the mechanics needed proving,
and a feature flag proves them without a lie on the mainnet table.

### The old devnet program was closed

Webgold's `3siGe…` and the first Scrip deploy `7DMP…` (the one with the stack overflow)
were closed to reclaim their rent; the public devnet faucet was rate-limited and the
deployer held 0.7 SOL. Scrip runs at the id in `Anchor.toml`. A closed program id cannot be
reused, which is fine: nothing had been published against either.

### Not committed to the multisig yet

The program is upgradeable by the deployer key. `docs/scrip.md` §15 puts multisig-then-
freeze after Stocklana.

### One wedge: the moment (2026-09-15)

The founder's review of the first complete build: "every single page feels generic … just
forms to set rules … Pick one wedge and make it excellent." The wedge is the moment money
lands and becomes stock with a receipt. So: the home screen IS that moment (live, a ghost
while money waits, a stub that prints when it settles); turning on is one question and one
signature; the front door shows one object; the ledger is a wall of the same object; send,
request and claim stay off the primary path. Cost was declared not to matter — "i really
dont care about mainnet rent fees … i just need to win this" — and the mainnet deploy stays
the founder's to fund.

### The public page is opt-in

`/book/<handle>` shows a live register to anyone, but only after the owner turns it on. The
chain is public anyway; what a savings product must not do is become the place where a name
resolves to somebody's income. The flag is off chain (`books.published`), reversible from
the home screen, and a handle on the public ledger is named only where it is on.

### Stand-ins are labelled, never dressed up

A devnet book against a mint the registry does not know is read from the chain and shown as
"stand-in" with its real decimals. It is never called SPYx, because it is priced by SOL/USD.
On mainnet the same mint would stay held: the registry is the only source of a name there.

### The front door is the product running (2026-09-15, evening)

The founder's second review: "we made it from generic to well built generic … a million
dollar feel … users are already using … what is possible with tokenized stocks on Solana
which was never possible before". Everything shown had to be real — "dont do that ever" to
any mock — so the front door became a real published book printing real receipts under a
printer, a market band whose every figure is read live from Jupiter and the mint, and three
doors to the three things a share could never do before (arrive as a payment, obey a rule on
an address, remember what it was for). The dedicated front wallet is the founder's to fund.

### Prices for display come from Jupiter, keyless

Hermes needs a key and the pinned SPYX/USD account was stale; Jupiter's price and token APIs
are keyless, live, and carry the underlying's price beside the tracker's. They are used only
for display (the band, "worth today"); settlement stays on Pyth on chain, and the band says so.

### Two ways to pay, and the second is the point

The pay page gained "in USDC": a Solana Pay transfer request to the recipient's normal
address, with no Scrip transaction at all. It is the sentence "payers never open Scrip" as a
button. The intake ("in stock") remains for a payment that should carry a reason.

### The front door is a film; the app is a document (2026-09-15, night)

The founder's third review: cinematic, motion on every scroll, and a doubt about the
palette — "generic good fonts and better texts". The answer keeps the identity (paper, ink,
the stub, document blue) and gives it a night: the front door opens dark, the printer glows,
the tape moves, the last sweep replays, the market band rolls to its figures, and then the
paper tears off into the document. Motion is spent only on real objects and real figures;
text never fades up on its own; app surfaces keep the single moment. Tokens gained the dark
ground's accent and money colours. Nothing became a mock: the founder's rule.

### Ask the question before the wallet

The rule page shows the question to a signed-out visitor and asks for the wallet only when
there is something to sign. The chosen rate, handle and asset survive the wallet popup.
Onboarding is "see the value, then sign", never "sign to see".

### Scrip is a company that pays in ownership (2026-09-16)

`docs/SCRIP-COMPANY-PLAN.md` arrived from the founder with three verdicts on the built
product — a serious wedge, "well-built generic" surfaces, and no reason to return — and one
instruction: widen the idea to "get paid in ownership", keep the name, build the company,
mainnet at the end when everything is built. The plan supersedes the design section, the
presentation section and the roadmap of `docs/scrip.md`. Everything else in that document
stands: the rule, the intake, keep-rate, the honesty rows, the definition of done.

### Five receipt kinds, two handle kinds

The `Receipt` gained `run_id` and its kind became `Sweep | Pay | Gift | Grant | Vest`; the
`Handle` gained `Person | Org`. Existing devnet accounts do not decode under the new layout,
which is why the devnet redeploy is a step and not a detail. The names on chain are the
names a person reads: "pay" and "gift" on a stub, never "settle" and "sponsor". The IDL's
Payout kinds keep their old names because the Payout is closed before anyone reads it.

### A grant is bought once, vests by keepers, and repays its own vests

`open_grant` + the route + `seal_grant` in one transaction: the whole grant is bought at
once, into an escrow the payer cannot spend, and sealed with a float. `vest` is
permissionless, so a keeper — or the recipient, or a stranger — releases what the schedule
allows and is repaid the tip and the receipt's rent from that float. The alternative, a
payer-signed release, would make every vest depend on the payer showing up; the plan's word
was "keepers vesting". Revoke caps releases at what has vested and returns the rest; nothing
in the program sends escrowed stock anywhere but to the recipient or back to the payer.
`/security` says so in one row.

### Vests are daily, not hourly

The plan's §5 said hourly. A $50 grant vesting hourly over a year would spend more in keeper
tips than it holds. The keeper vests each active grant once every `KEEPER_VEST_HOURS`
(default 24), and immediately at the first release and the final one. A person sees a vest
on their register each morning; a grant page shows the next one.

### An organisation is a handle, not a role

`open_book(slug, terms_version, kind)` with `kind = Org` is the whole difference. Any wallet
can pay in stock without one; an organisation handle gives it a public page — people paid,
runs, grants vesting — the sentence "pays in stock since", and a name on every receipt it
writes. No membership table, no permissions: the wallet that signs is the organisation.

### A run is a file and one signature

Twelve people in a CSV become twelve intakes, each its own receipt with its own reason,
sharing a `run_id`. The wallet signs them all at once (`signAll`) and the page relays them
(`/api/send`). No batch instruction was added to the program: each line is exactly the
intake a single payment is, and the run page is a query over receipts by `run_id`.

### The floor is a record, not a feed

`/floor` shows every receipt as it prints, over SSE, with the share that landed while the
NYSE was closed and the corporate actions read from the mint. No following, no likes, no
comments, no handles beyond the ones their owners published. The tape is the front door's
opening because a stranger must see money land and stock print without being told.

### "There is no opening bell"

Two materials assigned by surface: ink for the floor (the front door's opening and close,
the tape, the printer, the market band) and paper for every document (the register, the
receipt, the statement, the pay page). Fraunces in exactly two places: the wordmark and a
statement's title line. The stub at five sizes is the one object drawn everywhere.
"Register" is the word for a person's Book on every surface; `Book` stays in the code.

### Telegram first, because the message is the receipt

One message per receipt to a linked chat, with a link to open it. Email would need a
provider and a template; a Telegram bot needs a token. The message says what the stub says
and nothing more. It is configured by `TELEGRAM_BOT_TOKEN`; without one the settings page
says so instead of pretending.

### ⌘K resolves from shape, never from a lookup

The field opens a handle, a receipt signature, a run id, a grant address or a page from the
shape of the text. A wrong guess reaches a page that says "not found" honestly; the
alternative — a search index — would be another cache to keep true.

### Stay on a local validator until devnet is redeployed

The grant build is proven on a local validator with Pyth's SOL/USD and USDC/USD accounts
cloned from devnet (`scripts/localnet.sh`, `npm run test:localnet`, 19 tests). The devnet
program is the 2026-09-15 build; redeploying needs about 4.5 devnet SOL of buffer rent the
faucet will not give today. Until it lands, `.env.local` names the local validator and
`.env.local.devnet` keeps the devnet settings, so nothing on a surface is a mock and nothing
reads an account it cannot decode.

### Every server read passes a gate (2026-09-16)

The first index against `api.devnet.solana.com` failed with "Connection rate limits
exceeded": web3.js fires each call the moment it is asked, a page reads twenty accounts,
and the indexer walks every signature the program ever wrote. Scrip now holds itself to
what an endpoint allows — four calls a second and two at once on Solana's own endpoints,
a hundred on a paid one, no limit on a local validator — through one gate per endpoint held
on `globalThis`, because a dev server evaluates a module more than once and a gate in a
module variable would be one gate per copy. Nothing is dropped: a call waits its turn. A
slow page is a cost; a refused read would be a wrong number on a surface, which §2.4
forbids. Rent lookups, asked once per book and three times per sweep for a handful of
sizes, are cached by size in the same spirit.

The consequence is written into the runbook: a public endpoint cannot carry a first index,
and a paid RPC is not an optimisation but the thing that makes the cache reachable.

### The front book on devnet is an organisation, `@scrip`

The redeploy of 2026-09-16 changed the layout of `Handle`, `Payout` and `Receipt`, so the
`@demo` register of 2026-09-15 stopped decoding. Rather than keep a person's demo register,
the demo script now opens `@scrip` as an organisation (`DEMO_KIND=org`): the front door
shows the register that the plan says Scrip itself keeps, the one that pays its own
bounties. The old state file and the old cache are set aside rather than deleted, and the
indexer skips accounts it cannot decode instead of guessing at them.

### A milestone is a fact, not a prize

Five moments, each crossed by a receipt this register already holds, each dated by that
receipt and linked to it: the first receipt, the first whole share, ten receipts, thirty
days kept (only when the chain measured it and the units were still there), a thousand
dollars in stock. No badges, no streaks, no confetti, no goal anybody was set. The share
card is the stub with one line above it, at `/m/@handle/<id>`, and it exists only while the
register is public — a moment cannot leak a private register.

Beside them, one sentence of arithmetic: "about N more arrivals complete your first whole
SPYx", computed from this register's own average receipt and labelled as arithmetic, with
the plain warning that the next arrival may be any size. It is the one forward-looking line
in the product and it forecasts nothing.

### The VM deploy goes through the config file, never through a flag (2026-09-17)

`pm2 restart scrip-web --update-env` from an SSH shell replaced the process environment with
that shell's, whose PATH finds Ubuntu's Node 20. `next start` then ran under Node 20 while
`better-sqlite3` had been built for nvm's Node 22, and every page answered 500 with "Module
did not self-register" — a message that names neither Node nor the version. The deploy now
deletes and starts from `ecosystem.config.cjs`, which pins both the interpreter and the
PATH. The runbook says so, with the symptom, because the next person to meet it will be
reading a 500 and not a version mismatch.

### A confirmation is a question, not a subscription (2026-09-17)

web3.js confirms a signature over a WebSocket, and a WebSocket is a connection. Solana's
public endpoints refuse one per transaction long before they mind the number of calls, and
the refusal arrives as "Unexpected server response: 429" with the transaction already sent —
so the caller cannot tell a lost transaction from a refused socket. `confirmSignature` polls
`getSignatureStatuses` through the same gated HTTP path as every other read, and stops when
the signature confirms, when the chain says it failed, or when its blockhash can no longer
be accepted, which is the only honest way to say it will never land. The keeper, the crank,
the scripts and the on-chain battery all confirm this way.

### The socket, kept (2026-09-17)

Node's global `fetch` is undici, and undici ignores the `agent` web3.js hands it, so every
RPC call opened a fresh TLS connection. Measured here: a `node:https` keep-alive agent
carries six calls on one socket; undici opened six. `src/lib/solana/http.ts` is `fetch` for
JSON-RPC only — POST, a string body, the small part of `Response` web3.js reads — over a
kept-alive socket, and a test asserts that four calls arrive on one connection.

### The endpoint's budget belongs to the machine, not the process

With all of that in place the on-chain battery still failed, until the dev server was
stopped: the public endpoint counts per IP, so a browser tab polling a register every four
seconds and a nineteen-test battery are one budget. All 19 pass with nothing else running.
This is written down because the next person will otherwise read it as flakiness in the
program. It is the same fact from the other side: a paid RPC is not an optimisation.

### The build must produce the file the runbook deploys (2026-09-17)

`npm run anchor:build` built the mainnet program to `target/deploy/scrip.so` and stopped
there, while `docs/deploy.md` deployed `scrip-mainnet.so` and `/security` hashed it. That
file was three days stale: deploying it to mainnet would have put a pre-grant program under
an app that writes grant accounts, and every page would have failed to decode its own data —
the exact failure devnet had just shown us. The build now copies, the way the devnet script
always did, and `npm run preflight` prints the size and hash of the file that would actually
be signed.

### A preflight that reads the chain, not a checklist someone ticks

`npm run preflight [-- --mainnet]` answers "are we ready" by looking: the build's size and
hash, whether the program is deployed and whether its allocation still fits, what a deploy
would cost in rent and in buffer, what each key holds against what it needs, whether every
registry mint and pinned Pyth account exists on that cluster, whether a Pyth key and a paid
RPC are configured, and whether the keeper's USDC account exists. It signs nothing. A FAIL
is something that would break; a WAIT is something only the founder can supply.

### The mainnet proof cannot be the devnet battery

`npm run test:devnet` mints its own stand-in USDC and asset. The mainnet build refuses any
mint that is not on the registry and any pay-in mint but USDC — which is the whole point of
that build — so pointing the battery at mainnet proves nothing and fails at the first
instruction. The runbook now proves mainnet with five ordered steps of real money in small
amounts, and says plainly that only one of them tests something no test can: the real
Jupiter route inside the atomic sandwich, with the program's introspection guard around it.

### A scene enters when it is reached, and can never stay hidden (2026-09-17)

The founder found a blank band above the footer. The cause was the mechanism, not that
section: `<Reveal>` used an IntersectionObserver, and an observer reports a *change* in
intersection. A scene that goes from below the fold to above it in one step — a flick to the
end of the page, a restored scroll position, an anchor link — never intersects, so it never
fires, and its content stays at `opacity: 0` for good. Six scenes were invisible after one
jump to the bottom.

`Reveal` now asks a simpler question on scroll and on mount: has this element's top crossed
the bottom of the window? That is also true of everything already scrolled past, so the only
way to see nothing is for the scene to be genuinely below the fold. Two follow-ons, each a
way the old design could still have hidden something:

- **No per-scene threshold.** A threshold moved the trigger line up, and on a tall window the
  line sat above the scene, which then never entered. One line for every scene.
- **The line is the window's own edge, and a page that cannot scroll shows everything.** An
  inset line looks slightly better and would leave a section in the last few percent of an
  unscrollable window invisible with nothing the reader could do.

The lesson generalises: content hidden by default must be revealed by a mechanism that cannot
fail to run. Anything else is a blank page waiting for an unlucky scroll.

### The film hides only where a film can play

The same blank band had a second cause underneath it: with JavaScript off, or before
hydration, every scene was already `opacity: 0` and nothing would ever set `is-in`. The page
now marks itself `data-js` in the document head before first paint, and only then does the
CSS hide anything — so a crawler, a browser with scripting off, and the moment before
hydration all get the whole front door, in place. The guard is written `:where(html[data-js])`
because `:where()` adds no specificity: a plain `html[data-js]` prefix outranked every
`.is-in` rule and the film stopped playing altogether.

### The program's rent is a deposit, and the allocation is exactly the build (2026-09-17)

At $100 a SOL the deploy reads as $600, which is the wrong way to hold it. About half of that
is the buffer, returned within the minute the deploy lands. The other half is the rent that
makes the program's bytes rent-exempt, returned in full by `solana program close`. What is
actually consumed is about 0.05 SOL of fees. The founder needs the balance available, not
spent.

`--max-len` is therefore the exact size of the build, not the build plus a fifth: the deposit
scales with the allocation, and headroom bought now is the same money as
`solana program extend` bought at the upgrade that needs it — and only then, and only if the
binary has grown. That is 0.6 SOL of cash flow the founder keeps until it is needed.

Shrinking the binary further was measured, not assumed. The profile already carries
`opt-level = "z"`, `lto = "fat"`, `codegen-units = 1` and `panic = "abort"`; adding
`strip = "symbols"` saved 3,824 bytes, about 0.02 SOL. That is not worth an unverified change
to the program that will hold real money, so it was reverted. `overflow-checks = true` stays
on for the same reason it always was: money code.

### A page render reads the cache; the poll reads the chain (2026-09-17)

The front door took twelve to twenty-two seconds to its first byte on the VM. The cause was
in the render: `liveView` refreshed the receipt index from the chain before returning, so
every visitor waited on a walk of the program's signatures. It bought nothing — the same page
polls `/api/book/live` four seconds later, and that route, the maintenance route and the
keeper all refresh. Every server render now passes `{ refresh: false }`. `/@handle` went from
ten seconds to under one.

### The last good read, with its own timestamp

Solana's public endpoint throttles a datacenter IP hard, and no amount of politeness on our
side changes that. So a register keeps the last view that did read: when a fresh one cannot
be had, or when the gate is already cooling from a refusal, that view is served immediately
and the register says "as it was last read at …" above the figures. A blank page helps
nobody; a stale figure presented as current would be worse than either. The same sentence
covers being offline, which is the same fact from the reader's side.

The cool-off after a refusal was capped at six seconds for the same reason: a long pause is
polite to the endpoint and useless to the reader, once there is something honest to show.

### The keeper reads every register in one request

Each tick fetched one account per watched book, which on a public endpoint is a budget the
site needs — the keeper and the app share an IP, not a process. One `getMultipleAccountsInfo`
now covers every watched USDC account, and the idle poll is 45 seconds on Solana's own
endpoints against 15 elsewhere. A websocket still wakes the keeper the moment a watched
account changes, so the response to an arrival is unchanged.

### The bring-up is rehearsed, not improvised (2026-09-18)

`npm run rehearse` runs the mainnet sequence against a local validator: deploy, open the
organisation's register with the rule on, land money, sweep it, index, publish, then every
money path the battery covers, then the production build. Eighty-eight seconds, every step
green, and serving that state the front door printed the arrival and the floor counted twelve
receipts. Deploy day is now a repeat of something already done. What it cannot rehearse is the
Jupiter route inside the atomic sandwich, because Jupiter exists on neither devnet nor a local
validator; that is the one thing the first real sweep proves.

### Scrip runs two keepers

A single keeper is an operator with extra steps. Two, with different keys, racing for every
sweep, is the only demonstration that the program leaves a keeper no discretion: whichever
lands first writes the receipt, and the other's transaction fails because the program refuses
to sweep the same arrival twice. `KEEPER_HEALTH_URL` takes a list, `/keepers` names each by
the receipts it wrote, and the page says how many of them are reporting. A third, run by
somebody who is not the founder, needs nothing from us.

### The film is a record, not a demonstration

`docs/film.md` is the shot list, with a checklist of what must already be true before the
camera turns on. Its rule is the plan's: the film never explains, every scene shows a stub
printing for a real person, and no sentence goes in that could not be checked by opening a
page in the film. If a route fills below the Pyth minimum and the whole transaction reverts
during the shoot, that is the best shot in the film, not an outtake.

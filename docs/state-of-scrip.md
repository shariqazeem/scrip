# Scrip — the state of the company, 18 September 2026

> What Scrip is, what every surface looks like and does, how the money moves on mainnet, and
> what is left. Written against `docs/SCRIP-COMPANY-PLAN.md`, which this document reports on.
>
> Every figure here was measured or read from the chain on 17–18 September 2026. Where
> something is not done, it says so. Nothing in this document is a projection.
>
> Live on devnet: **https://scrip.80.225.209.190.sslip.io**
> Stocklana submissions close **25 September 2026**; judging follows; then the Colosseum
> World's Fair.

---

## 1. The idea, in one page

**Scrip is where income becomes ownership.**

Since the first stock exchange, being paid in ownership was for employees of public companies
with brokerage accounts. A stock was a certificate, then a line in a broker's database, and in
both cases something you had to go somewhere to buy, in hours somebody else kept. On Solana a
stock is a token, and a token can be paid, ruled, given, vested and remembered like money.

That has two sides, and Scrip is both.

**The person's side — a rule on the wallet you already get paid to.** Set a rate once, ten
percent by default. A slice of every USDC that lands becomes S&P 500 in the same wallet,
seconds later, with a permanent receipt anyone can open. Payers keep sending dollars and never
open Scrip. Pausing is a token-program `revoke` the program cannot prevent.

**The organisation's side — pay in ownership.** Pay one person, a whole team from a file, or a
grant that vests, in stock, with one signature. Every line is its own receipt carrying its own
reason. A grant sits in an escrow the payer cannot spend and is released on schedule by
keepers, not by the payer showing up.

**The number that decides everything: keep-rate.** The share of what was converted that is
still held, measured on chain at 7 and 30 days from raw units. It cannot be faked: the
denominator is the receipt's own `amount_raw` and the numerator is a balance the program read
from the recipient's own token account.

### The seven firsts

Each is something a stock could not do before it was a token on Solana, and each is a surface
in this repository, not a claim.

| | A stock can | Where it happens |
| --- | --- | --- |
| 01 | be paid | `/app/org/pay` — an organisation pays a person in stock, one signature |
| 02 | obey a rule on an address | `/app/rule` — a slice of every arrival becomes stock |
| 03 | remember why it arrived | `/receipt/<sig>` — the reason is hashed onto the receipt |
| 04 | vest from anyone to anyone | `/grant/<pda>` — an escrow the payer cannot spend, released by keepers |
| 05 | arrive at 3am on a Sunday | `/floor` — the share of arrivals while the NYSE was closed |
| 06 | be given to an empty wallet | `/claim/<payer>/<id>` — a relayer pays the fee |
| 07 | prove it was kept | `/ledger` — keep-rate measured on chain at 7 and 30 days |

---

## 2. Design: "There is no opening bell"

### Two materials, assigned by surface

The world of the old exchange floor, reborn without hours. The **tape** is the live feed, the
**register** is the personal record, the **stub** is the receipt, the **floor** is the network,
the **keepers** are the runners.

- **Ink** — `#14161c`, dense, alive. The floor: the front door's opening and close, the tape,
  the printer, the market band, the marketing navigation. Paper-coloured text on ink, one
  accent, no glow, no gradients.
- **Paper** — `#f7f5ef`, calm, permanent. Every document: the register, receipts, statements,
  the pay page, the organisation's pages. White stubs on paper, ruled rows, a perforated edge.

Dark is not a mode. It is where the crowd is. The seam between them on the front door is the
stub's own perforation, drawn as a torn edge.

### The palette, in full

| Token | Value | Only for |
| --- | --- | --- |
| `--bg` | `#f7f5ef` | paper, the ground of every document |
| `--surface` | `#ffffff` | the stub, and nothing else that is not a stub |
| `--ink` | `#14161c` | words on paper; the ground on the floor |
| `--ink-muted` / `--ink-faint` | `#5a5d66` / `#8b8e97` | secondary and tertiary words |
| `--accent` | `#2b4acb` | every interactive and brand element, document blue |
| `--accent-inverse` | `#9db0f7` | the same role on ink |
| `--ok` / `--err` | `#15803d` / `#dc2626` | money outcomes only — settled, still held, failed |
| `--gold` | `#9a6f1e` | the GOLD chip and nothing else |

Green and red are never decoration. There is no second accent.

### Type

Instrument Sans for words. IBM Plex Mono, tabular, for every figure — amounts, units,
addresses, hashes, dates. **Units are the largest thing on any page they appear on**, and
units come before dollars. Fraunces appears in exactly two places: the wordmark, and the title
line of a statement. Nowhere else.

### One object, five sizes

Nothing on the site is allowed to look like a card unless it is a stub. If it is not a stub it
is a ruled row or a paragraph.

| Size | Where it appears |
| --- | --- |
| Stub, full | `/receipt/[sig]`, a statement, anything printed |
| Stub, card | the register, run pages, grant pages |
| Stub, line | the tape, `/app/receipts`, the ledger wall |
| Stub, ghost | dashed: money landed and not yet swept; a grant not yet vested |
| Stub, share | the OG image: receipt, register, organisation, run, grant, milestone |

The mark is the stub glyph — a sheet with a perforated edge and two ruled lines. It is the
favicon, the home-screen icon, and the keeper's health dot.

### Motion

Spent only on real objects and real figures entering: a stub prints when a sweep lands, a
figure rolls to its real value, the tape advances when a receipt exists, the last sweep
replays from its own receipt. Text never fades up on its own. Hover changes colour, not
position. Reduced motion collapses all of it.

A scene enters when it is **reached** — its top crosses the bottom of the window, which is also
true of anything already scrolled past. This is a scroll check and deliberately not an
IntersectionObserver: an observer never fires for a scene the reader jumped over, and a missed
scene is invisible content. Whatever is hidden by default must be revealed by a mechanism that
cannot fail to run. With JavaScript off the whole front door renders in place.

---

## 3. Every page, and what it looks like

### The front door — `/`

A film in two materials, all of it real.

1. **Dark opening.** "Your income invests itself." Right of it, the front register
   (`NEXT_PUBLIC_FRONT_BOOK`) prints its last receipts live under a printer bar, with a ghost
   stub while money sits unswept. On mainnet a Solana Pay QR: "Send this wallet $5 and watch."
2. **The floor.** "There is no opening bell." The NYSE clock against Scrip's ("closed, opens
   in 4 h" / "open"), then four figures: arrivals while Wall Street slept, keep-rate at 7 and
   30 days, keepers running. Then the receipts total with what it converted.
3. **The tape**, live over server-sent events: every receipt as it prints, its kind, who, what
   became what, the reason, how long ago.
4. **Corporate actions**, read from the mint on mainnet: each rebasing asset's live multiplier,
   when it last changed, and the sentence that every register is already right.
5. **The market band**: price, day change, the underlying, holders, liquidity — from Jupiter,
   labelled display-only.
6. **The mechanism**: the last real sweep replayed from its receipt, instruction by
   instruction — the payer, the coin on the wire, the address with its rule, the atomic
   transaction lighting up `begin_sweep`, the route, `finish_sweep` with the Pyth check, then
   the split into "became N units" and "stayed USDC". Six numbered steps beneath it, a Replay
   button, and a link to the receipt.
7. **The paper tears off.** The positioning line. Then the seven firsts as ruled rows, each
   linked to where it happened today. Then the evidence as two bars. Then the honesty rows, one
   per fact, never a banner. Then the public record: receipts, converted, wallets with the rule
   on, keep-rate, and three stubs printing in sequence.
8. **Dark close.** "Set a rate once. Then get paid.", the two buttons, and the live line
   "$1,180 sits at @scrip right now, watched."

### The register — the person's side

| Page | What is on it |
| --- | --- |
| `/app` | The rule in one line. The wallet being watched, its state, the allowance left, the float. A warning line when the state needs one, naming the cause. The story since the first receipt: landed, became stock, units, worth today, and the staircase of cumulative units. The register of stubs, newest first, polled every four seconds; a dashed ghost stub while USDC sits unswept; a new stub prints at the top as it settles. Holdings, still-held, moments, the pay link |
| `/app/rule` | One question: how much of every payment should become stock. Three presets and another rate, answerable before any wallet is connected. The $500 example underneath. Handle and asset as two ruled rows. Everything with a default folded under "what the rule may do". **One signature** opens the register, approves the delegate, funds the float and enables the rule |
| `/app/holdings` | What the rule bought, per asset, with the live multiplier and whether it is still held |
| `/app/receipts` | Every stub as a line, filtered by kind, exportable as CSV |
| `/app/statements` · `/app/statements/[ym]` | A month as a document: what landed, what became stock, at what prices, what is held. Arithmetic on receipts, projecting nothing. Prints to one page. A month with no receipt says so |
| `/app/settings` | Allowance and float with their own actions, the public page toggle, Telegram linking, the handle and the pay link |

### Pay in stock — the organisation's side

| Page | What is on it |
| --- | --- |
| `/app/org` | People paid, stock delivered, grants vesting, the last run |
| `/app/org/pay` | One person: a handle or an address, an amount, a reason, and an optional split between stock and USDC. A live quote. One signature |
| `/app/org/runs` | A run from a CSV of handle, amount, reason. The file previews as lines; one `signAll`; each line relays as its own receipt sharing one run id |
| `/app/org/grants` | Open a grant: recipient, amount, asset, cliff, duration, whether it is revocable, a reason, and the float that pays for its vests. Revoke and close on the ones open |
| `/app/org/people` | Everyone this organisation has paid, and what they were paid |
| `/app/org/settings` | Take an organisation handle, publish the page, export payments and grants as CSV |

### Public records — what a stranger opens

| Page | What is on it |
| --- | --- |
| `/@handle` | A person's register, read-only and opt-in; or an organisation's page: pays in stock since, people paid, paid in all, grants vesting, every payment as a row with its reason |
| `/receipt/[sig]` | The stub as the hero, built from the chain. What arrived, with issuer chips. Where it is anchored. Print-like, unshelled, one copy button of client JavaScript |
| `/run/[id]` | A payroll run: label, payer, N of M paid, the total, every line a receipt with its reason |
| `/grant/[pda]` | A grant read from the chain: units, what it cost, the schedule as a bar, vested so far, the next vest, every vest as a receipt. Revoke and close for the payer |
| `/m/@handle/[id]` | A moment: one line, the stub that crossed it, and the register it belongs to |
| `/pay/[handle]` | Two ways. In stock: the intake, with a reason that lands on the receipt. In USDC: a Solana Pay transfer to their normal address, no Scrip transaction, and their rule takes its slice |
| `/claim/[payer]/[rid]` | A first share waiting. Claim into your wallet with a relayer paying the fee |
| `/floor` | The same tape, clock and figures as the front door, inside the app |
| `/ledger` | Aggregates as a ruled strip, then a wall of stubs, newest first |
| `/keepers` | Scrip's keeper's health, every keeper that has ever submitted a sweep, the five can/cannot lines, and how to run one |

### Marketing and trust

`/people`, `/teams`, `/grants` are the three doors. `/company` carries the manifesto and the
seven firsts. `/security` reads the program id, the deployed byte length, the upgrade
authority and the build's hash off the chain at request time, and says plainly what is not
done. `/bounties` lists Scrip's own, paid in stock. `/changelog`, `/brand`, `/actions`,
`/assets` and six `/docs` pages complete the map.

### Every state, designed

| State | What Scrip does |
| --- | --- |
| Loading | The real layout with ruled bars. Never a spinner, and never a bar that reads as a figure |
| Empty | What will fill it, in words. Never a sample row, never a zero standing in for unknown |
| Paused | Named cause: revoked, delegate replaced, allowance out, float empty, no keeper reporting |
| In flight | One toast, bottom left: building, waiting for your wallet, confirming, settled, not sent — the same words as the button. Settled links the object and leaves; a failure stays until dismissed |
| Success | The object appearing. Never a green banner |
| Error | What happened and the one action that might work. A refused endpoint says so by name |
| Offline | The register renders from the last read and says the time it is showing |
| Stale | Same sentence when the endpoint is refusing: the figures are that moment, not this one |

⌘K anywhere resolves a handle, a receipt signature, a run id, a grant address or a page name
from the shape of what you type. Every public record renders an OG share card. The site
installs to a phone's home screen and opens at the register.

---

## 4. How it works on mainnet

### The program

Anchor 0.31.1, deployed at `Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj`. It holds the rule
and writes the receipts. **It never holds the asset across a slot, and it never CPIs Jupiter**:
swaps are top-level instructions in the same transaction, and the program makes that
transaction atomic around them by reading the instructions sysvar.

Five accounts: `Book` (a register), `Handle` (a name, person or organisation), `Payout` (an
escrow that exists exactly while a payment is open), `Grant` (an escrow that vests), `Receipt`
(permanent, one per money moment, five kinds).

### An arrival, second by second

1. Somebody sends USDC to the recipient's ordinary Solana address. They have never heard of
   Scrip.
2. A keeper notices the balance rose above the watermark — over a websocket in seconds, or on
   its poll.
3. The keeper posts a fully verified Pyth price if the on-chain one is stale, quotes Jupiter,
   and submits one transaction: `[compute, begin_sweep, jupiter…, finish_sweep]`.
4. `begin_sweep` refuses unless it is top level, unique in the transaction, and followed by a
   `finish_sweep` for the same register. It computes the slice from on-chain state and moves
   exactly that much USDC through the delegate.
5. `finish_sweep` requires the owner's cash unchanged, a fully verified Pyth price under 600
   seconds old with a confidence band under 1%, and a delta on the owner's asset account at or
   above the minimum — converted through the mint's live scaled-UI multiplier where the feed
   prices a share. It writes the receipt and repays the keeper the tip and the rent it
   advanced, from the owner's float.
6. Any failure reverts everything, the delegate transfer included. The money never leaves in a
   half-done state.
7. The stub prints on the register, on the floor, and in a Telegram message.

The rule sees the **net increase since the last sweep**, never gross inbound. Money spent
before a keeper acts is not taxed, and the watermark follows a balance down through the
permissionless `sync_watermark`.

### Paying in stock

The payer signs one versioned transaction: a memo carrying the reason, `fund_payout`, the
Jupiter route into the escrow, and `release_payout`. The recipient's own token account is
created on the way if it does not exist. A gift to somebody with no register becomes a claim
link; the claimant's own wallet takes it with a relayer paying the fee, and an unclaimed gift
returns to the payer after thirty days.

A run is the same intake repeated, sharing one run id, signed once with `signAll`.

### A grant

One transaction buys the whole grant into an escrow the payer cannot spend, and seals it with
a float. `vest` is permissionless: anyone may release what the schedule allows, a Vest receipt
is written to the recipient carrying the grant's reason, and the caller is repaid the tip and
the receipt's rent from that float. Revoking caps releases at what has vested and returns the
rest. While it vests, dividends reinvest into the escrow through the mint's multiplier.

### What the issuer can do, said plainly

Every xStock carries a permanent delegate and a pause authority: the issuer can move, burn or
freeze. Self-custody here means *not our custody*. Not offered to US persons; the owner attests
eligibility when the register is opened. Dividends are reinvested, not paid. Oro GOLD has
neither a freeze authority nor a permanent delegate, which is why disclosure is per row and
never a banner.

### What a keeper can and cannot do

Cannot choose the amount: the program computes the slice. Cannot skip the check: `begin_sweep`
refuses without its `finish_sweep`. Cannot redirect the output: the owner's own account is
verified before and after. Its only discretion is the route, inside the owner's tolerance,
against Pyth net of confidence. Its only reward is a fixed tip of 0.0005 SOL plus the rent it
advanced.

### The assets

Fifteen mints on the registry, compiled into the program and mirrored in TypeScript with a test
that reads both: SPYx (the default), QQQx, Oro GOLD, and twelve single names including NVDAx,
MSFTx, TSLAx, AAPLx and COINx. The mainnet build refuses any mint not on that table and any
pay-in mint but USDC.

### Reading the chain without being refused

Every server read passes one gate per endpoint per process: four calls a second on Solana's own
endpoints, a hundred on a paid one. Requests share a kept-alive socket, because Node's fetch
ignores the agent and a new TLS connection per call is what a public endpoint punishes first.
Confirmations poll rather than open a websocket per transaction. Transactions are read in
batches. A refusal makes every caller wait out one short cool-off rather than each retrying,
and a register serves its last good read — timestamped and labelled — instead of a blank page.

**A paid RPC is not an optimisation.** The public endpoint blocks `getTransaction` from an IP
for long stretches and throttles a datacenter address hard; its budget is per IP, so a browser
tab, the keeper and a test run share one.

---

## 5. What is proven, and how

| | Result |
| --- | --- |
| On-chain battery against the deployed devnet program | **19 of 19** — open, enable, sweep against real Pyth, introspection refusals, a fill below the minimum reverting, a UI-priced feed through the multiplier, watermark sync, an intake, a release below minimum refused, a sponsored gift claimed from an empty wallet, an organisation handle, a run sharing one id, a grant opened and sealed, a vest, a vest refused before the cliff, revoke, close, a second grant, an early measurement refused, and pause by revoke |
| The program's own tests | 43 (devnet build), 40 (mainnet build) |
| Offline suite | 236 passing |
| Registry battery, read off mainnet | every mint and pinned feed present and matching |
| Lint, typecheck, production build | clean |
| Bring-up rehearsal, timed | **88 seconds** from nothing to a site printing receipts (`npm run rehearse`) |

The deployed devnet site carries the same build as this repository. Its front register `@scrip`
is an organisation; the floor shows real sweeps, payments, gifts, grants and vests, each with
its reason, all in stand-in mints that every surface labels as stand-ins.

---

## 6. What mainnet costs, and what is waiting

Read from the chain by `npm run preflight -- --mainnet`:

| | Amount | What happens to it |
| --- | --- | --- |
| Deploy buffer | 2.97 SOL | returned within the minute the deploy lands |
| Program rent | 2.97 SOL | a deposit on 585,384 bytes, returned in full by closing the program |
| Fees | 0.05 SOL | the only part actually spent |
| Keeper | 0.10 SOL | fees and Pyth posts; the rent it advances comes back |
| Front wallet | 0.07 SOL | the register's rent and its float |

Still waiting on the founder: those balances, a Pyth API key (Hermes has required one since
26 August 2026), a paid RPC, a Telegram bot token, and the people who will be paid real
bounties.

**Deploy by 21 September.** Keep-rate matures at 7 days: a register opened on the 21st shows
its 7-day figure on the 28th, during judging. Later than that and the bring-up, the first real
recipients and the film have no room.

---

## 7. What is left

**In the plan.** Phase 6 only: the two-minute film, and the submission. Phases 2 to 5 —
the company shell, teams, grants, and the return surfaces — are built, deployed and tested.
Phase 1 is mainnet itself.

**Outside the plan, worth doing.** A verifiable build so a stranger can check the deployed
bytes against the source; a second keeper so the race on `/keepers` is real; a second
organisation that is not us; and the real bounty recipients that turn the floor into other
people's money.

**Known and deliberate.** No audit. The upgrade authority is a key until the multisig. The
legal shape — grants of securities-backed tokens on a schedule, executed by third-party
keepers, non-custodial in design — has not been reviewed by a lawyer. All three are on
`/security`, in those words.

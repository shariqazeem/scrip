# Scrip — the product, complete (v2: the rule is the product)

> Canonical definition, 2026-09-15. Everything in the repository transforms into what this
> document describes. Where the code and this document disagree, the code is what changes.
> It replaces `docs/product.md`, `docs/strategy.md`, the product half of `CLAUDE.md`, and
> v1 of this document. `docs/decisions.md` keeps its history and gains §13.

---

## 0. The one thing

**Scrip is a rule on your wallet: a slice of every dollar that lands becomes stock, in the
same wallet, with a receipt.**

The recipient sets a rate once — 10% by default — on the Solana address they already use.
Payers keep sending USDC to that address exactly as they do today and never open Scrip.
Within seconds of an arrival, the slice is S&P 500 in the recipient's own token account, a
permanent receipt is written, and the chain records at 7 and 30 days whether it is still
held. Pausing the rule is a token-program `revoke`, which the program cannot prevent.

One line for Stocklana:

> Set a rate once. A slice of every USDC that lands in this wallet becomes S&P 500 in the
> same wallet. The payer just sent dollars.

One line for the World's Fair:

> The 401(k) for stablecoin income. A 401(k) is a rule on a paycheck; Scrip is a rule on a
> wallet.

The positioning line, everywhere the product is explained to a person:

> You're already getting paid. Investing shouldn't take another decision.

The company, one step further than the product: **rules on income.** A stock slice is the
first rule. The same standing instruction later routes a slice into a mix, a reserve, or a
set-aside, for a person, a grant program, or an agent's treasury. The product sentence stays
specific — a slice into the S&P 500 — and the roadmap shows the layer. "Programmable money
routing" is never the headline: it is abstract, it is crowded on other chains, and it does
not name a person.

The wedge, in the brief's own categories: **Investing — at the moment of receipt.** It makes
recurring buys unnecessary because the money never has to be moved anywhere first.

Name: **Scrip** (paid-in). The repository may stay `webgold`; nothing public says Webgold.

### Why it is not a transfer app, a swap, or a DCA

A transfer app has a send button at its core. Scrip has no send button at its core; the
core action is a standing instruction the recipient sets on their own account. The payer does
nothing different. A swap is a decision made after cash is sitting there; Scrip fires before
that decision exists. A DCA needs capital already committed to someone's escrow; Scrip needs
no capital anywhere and scales with income. The objection "why not just send USDC?" is
answered by the product itself: they did, and the recipient still got stock.

---

## 1. The user, the problem, the mechanism

**The user is a person paid in stablecoins on Solana.** Freelancers, contractors of crypto
companies, grant recipients, bounty earners, hackathon winners. Global, mostly outside the
US. The founder is this user.

**The problem.** This person can receive a stablecoin from anyone, anywhere, at any hour, and
cannot own the S&P 500 without a brokerage account most of them cannot open and a decision
they never make. Crypto-native people are not "attracted" to stocks; USDC that arrives is
spent or goes back into crypto. Tokenized stocks trade on Solana, but every product around
them is a venue for people who already decided to invest — the lowest-conversion moment in
personal finance.

**The mechanism: a contribution rate on income.** Madrian & Shea (2001): automatic
enrollment raised 401(k) participation among new hires from 37% to 86%. Thaler & Benartzi
(2004), *Save More Tomorrow*: binding contribution increases to pay raises took average
saving rates from 3.5% to 13.6% over forty months. Acorns and Robinhood's direct-deposit
split are the same mechanism in consumer form, with tens of millions of users on a product
whose entire UX is "do nothing." All of them require a US bank and a US brokerage. On Solana
the wallet is the paycheck account for everyone paid in stablecoins, and nobody has put a
rule on it. (Papers and figures with sources in `docs/research.md`.)

**Retention model, stated plainly.** Low engagement, high persistence. The user sets a rate,
never has to return, and the book grows. The app's job is the receipt, the keep-rate, and
the occasional rate change. Success is measured in keep-rate and units held, not in sessions.

**Why Solana, load-bearing.** Every one of these is required and none has a TradFi
equivalent: a token-program delegate that lets a program move a slice of the owner's USDC
without custody; PDAs that sign inside a program; instruction introspection that makes a
multi-instruction sweep atomic; 24/7 settlement; sub-cent fees so a $5 slice is viable;
Jupiter routing; Pyth prices posted on chain; and the stock itself as a Token-2022 mint that
can land in a token account the recipient already owns.

**Why now.** Tokenized-equity supply on Solana is at a record and holder addresses number in
the hundreds of thousands, many of whom never decided to become equity investors. On 10
September Nasdaq's venture arm put $100M into Kraken's parent, with Nasdaq Equity Tokens
planned to launch through the xStocks platform in Q2 2027 and SEC approval already in hand
for certain stocks to trade and settle in tokenized form (Reuters, 2026-09-10; cite in
`docs/research.md`). The venues exist and the incumbents are building more. The rule does
not exist.

**The judges are the payer.** The Foundation pays grants in USDC, Superteam pays bounties in
USDC, this hackathon pays prizes in USDC. "Your prize lands, and 10% of it is the S&P 500
before you've looked" is the sentence.

---

## 2. What Scrip is, and is not

Scrip is non-custodial software that executes the recipient's standing instruction. Four
objects:

1. **A rule** — rate, asset, optional floor and cap — on the recipient's own USDC account,
   held in a `Book` they own, enforced by the program, driven by permissionless keepers.
2. **A receipt** — a permanent on-chain account written in the same transaction as the
   conversion, at `scrip.app/receipt/<signature>`, measured at 7 and 30 days.
3. **A pay link** — `scrip.app/pay/<handle>` — the *intake* for attributed payments: an
   invoice with a reason, a gift, or a payment to someone who has no rule yet. Same
   conversion, same receipt, different signer.
4. **A public ledger** — every receipt, and keep-rate.

Scrip is not a trading terminal, a robo-advisor, a lender, a card, a social feed, a
launchpad, or a brokerage. It never decides amounts: the rate is the owner's, the price is
Jupiter's route bounded by Pyth, the timing is arrival. It gives no advice. It never holds
an asset across a slot.

Principles: (1) non-custodial by construction; (2) no model, operator or program decides how
much; (3) every money moment prints a receipt anyone can open; (4) never show a number that
cannot be derived from chain state; (5) savings-grade, not stable — equities fall, and the UI
says so.

---

## 3. The flows

### 3.1 The rule — the product

**Turn on.** The owner opens a Book (handle, asset, eligibility attestation) and turns on
the rule in one signature: rate, floor and cap are written; the current USDC balance becomes
the watermark; an allowance is approved to the Book's address as token delegate; a small SOL
float is deposited on the Book to pay for receipts and keeper tips.

**Sweep.** Whenever the owner's USDC balance rises above the watermark by at least the
minimum, a keeper submits one atomic transaction: the program computes the slice from
on-chain state, moves exactly that much USDC via the delegate, a Jupiter swap turns it into
the asset landing directly in the owner's own token account, and the program verifies the
amount received against Pyth and writes the receipt. If any step fails, nothing moves.

**Pause.** One click calls the token program's `revoke`. No sweep can happen until the owner
approves again. Resuming resets the watermark to the current balance, so money that landed
while paused is not taxed retroactively. The program cannot prevent a pause.

**What "lands" means, precisely.** The rule sees the *net increase of the USDC associated
token account since the last sweep*. If $500 arrives and $500 leaves before a keeper acts,
nothing converts. Keepers act within seconds, so this is rare, and the interface says so.
The tagline may say "every dollar that lands"; the sentence directly beneath it, everywhere,
is the defensible one: *Scrip invests a slice of your wallet's USDC inflows.*
Swap proceeds count: sell a token for USDC and the slice converts — every time you take
profits, part of it leaves the casino. The cap keeps a large treasury move from being taxed;
the floor keeps cash from dropping below what the owner needs.

### 3.2 Intake — the pay link

`scrip.app/pay/<handle>` is a public page with a QR. A payer enters an amount and a reason,
signs once (desktop wallet or phone wallet via Solana Pay), and one atomic transaction swaps
their USDC into the recipient's asset, lands it in the recipient's own token account, and
writes a receipt whose "from" and "for what" are cryptographic. The payer needs no account
and never holds a stock. This is how invoices, grants and gifts arrive with a memory; it is
not how most money arrives.

### 3.3 Paying someone who has no rule yet — sponsor and claim

Paying an address with no Book, or a link with no address, creates a sponsored position: the
swap output waits in a program escrow under the payer's payout. The recipient claims with one
tap, opening a Book in the same transaction, attesting eligibility, and receiving a receipt.
Claims are fee-sponsored so an empty wallet can claim. The payer can cancel after 30 days.
This is how a new holder appears without deciding to open an account.

### 3.4 Measure

A permissionless instruction records the owner's raw balance of the asset into a receipt at
7 and 30 days after settlement. Anyone can call it; the app's crank does. Keep-rate is
computed from these on-chain measurements.

---

## 4. Assets and defaults

| | Decision |
|---|---|
| Pay-in asset | USDC only. The rule watches the owner's USDC associated token account. |
| Assets | One asset per Book in v1: SPYx (default), QQQx, GOLD (Oro), or a single-name xStock from the registry. Mixes are a defined extension (§13). |
| Registry v1 | SPYx, QQQx, GOLD, and the deepest single-name xStocks by 7-day Jupiter volume. Every field read off mainnet with the date. A rule asset must have a Pyth feed with a 24/7 cadence; the registry marks which do. GLDx and SLVon are not eligible. |
| Rate | Default 10%. Presets 5 / 10 / 20. Maximum 50%. Optional escalation +1% per 90 days, capped. |
| Floor | Optional. "Keep at least $X as cash." Default none. |
| Cap | Maximum taxable amount per inbound. Default $5,000. |
| Minimums | Inbound $1; slice $0.50. |
| Allowance | Delegate approval amount. Default $1,000; the owner chooses. Sweeps stop when it runs out. |
| Float | SOL held on the Book for receipts and keeper tips. Suggested 0.05 SOL (about 14 sweeps). |
| Tolerance | Sweep min-out is 100 bps below the Pyth price net of confidence; the owner may set 50–300. |
| Feed age | A sweep waits if the asset's Pyth feed is older than 600 s. Nothing is lost by waiting. |
| Intake slippage | 50 bps on the payer's quote; price impact over 100 bps is refused. |
| Single names | Allowed as the owner's choice, with an after-hours liquidity note. Never a default. |

Gold is one option among several. It is not in the hero, the default, or the pitch.

---

## 5. The program

Anchor, mainnet. The instruction set is exactly what is listed here; anything not listed does
not exist in Scrip. The program never CPIs Jupiter. Swaps are top-level instructions in the
same transaction, and the program makes the transaction atomic and verifiable around them.

### 5.1 Accounts

```
Book        PDA ["book", owner]                          // also the token delegate address
  owner            Pubkey
  slug             String (3–24 chars, [a-z0-9])
  asset            Pubkey                                // the one asset in v1
  terms_version    u8                                    // eligibility attestation; >= 1 for any xStocks asset
  opened_unix      i64
  bump             u8
  rule
    enabled        bool
    rate_bps       u16                                   // 1..=5000
    escalate_bps   u16                                   // added every 90 days; 0 = none
    floor_usdc     u64                                   // 0 = none
    cap_usdc       u64                                   // 0 = none
    min_inbound    u64                                   // default 1_000_000
    tolerance_bps  u16                                   // 50..=300
    watermark      u64                                   // USDC balance the rule has already seen
    enabled_unix   i64
    sweeps         u32
  pending          Option<Pending { release_id: [u8;16], slice: u64, usdc_before: u64,
                                    asset_before_raw: u64, slot: u64 }>
  // float: lamports held on this account above its rent-exempt minimum

Handle      PDA ["handle", slug]  ->  owner: Pubkey

Payout      PDA ["payout", payer, release_id]            // intake and sponsor
  payer            Pubkey
  recipient        Option<Pubkey>                        // Settle: required. Sponsor: the address, or None
  claimant         Option<Pubkey>                        // Sponsor with no address: the claim key's pubkey
  kind             Settle | Sponsor
  release_id       [u8; 16]
  reason_hash      [u8; 32]
  declared_usdc    u64                                   // the exact-in amount of the swap
  asset            Pubkey
  min_out_raw      u64
  state            Open | Released | Cancelled
  created_unix     i64

Receipt     PDA ["receipt", book_or_payout, release_id]  // permanent; ~250 bytes
  kind             Sweep | Settle | Sponsor
  recipient        Pubkey
  payer            Option<Pubkey>                        // Sweep: None (attributed off-chain)
  release_id       [u8; 16]
  reason_hash      [u8; 32]                              // zero for Sweep
  basis_usdc       u64                                   // Sweep: the net inbound that triggered it. Settle: paid
  rate_bps         u16                                   // Sweep: the rate applied. Settle: 10_000
  paid_usdc        u64                                   // the slice actually converted
  asset            Pubkey
  amount_raw       u64                                   // raw token units received
  price_stamp      Option<{ feed: Pubkey, price: i64, expo: i32, conf: u64, publish_time: i64 }>
  settled_slot     u64
  settled_unix     i64
  measured_7d      Option<u64>                           // the recipient's total raw balance at >= 7 days
  measured_30d     Option<u64>
```

Reason text for intake travels in an SPL Memo in the same transaction; the Receipt stores its
hash and the receipt page shows the memo from the transaction. A Sweep receipt has no memo.

### 5.2 Instructions

**Book**

| Instruction | Signer | Enforces |
|---|---|---|
| `open_book(slug, asset, terms_version)` | owner | slug valid and free (creates Handle); asset in registry; `terms_version >= 1` for an xStocks asset |
| `set_asset(asset, terms_version)` | owner | `pending` is None; the rule's watermark is reset to the current balance |
| `close_book` | owner | rule disabled, `pending` None; returns float and rent |

**Rule**

| Instruction | Signer | Enforces |
|---|---|---|
| `enable_rule(rate_bps, escalate_bps, floor, cap, tolerance)` | owner | ranges; `watermark = current USDC balance`; `enabled_unix = now`. The client puts `approve_checked(delegate = Book)` and a system transfer of float into the same transaction. |
| `set_rule(...)` | owner | same ranges; `pending` None; watermark reset to current balance |
| `disable_rule` | owner | `pending` None. The client puts `revoke` in the same transaction. Pausing without disabling is `revoke` alone. |
| `deposit_float` / `withdraw_float(lamports)` | owner | the account stays above rent-exempt minimum |
| `begin_sweep(release_id)` | keeper (fee payer) | see §5.3 |
| `finish_sweep` | keeper | see §5.3 |

**Intake**

| Instruction | Signer | Enforces |
|---|---|---|
| `fund_payout(release_id, kind, recipient?, claimant?, reason_hash, declared_usdc, min_out_raw)` | payer | creates the Payout and an escrow ATA for the asset owned by the Payout PDA. Settle: the recipient's Book exists and its asset matches. Sponsor: no Book required. |
| `release_payout` | payer, same transaction | state Open, kind Settle; escrow amount `>= min_out_raw` and `> 0`; moves escrow → the recipient's ATA (created idempotently, rent from the payer); writes Receipt; closes escrow and Payout, rent to the payer |
| `claim_payout` | the recipient address, or the claim key holder | state Open, kind Sponsor; the claimer has a Book (the client prepends `open_book`); same move and Receipt; closes escrow, rent to the payer |
| `cancel_payout` | payer | kind Sponsor, unclaimed, `>= 30` days; escrow → the payer's ATA; closes |

**Measure**

| Instruction | Signer | Enforces |
|---|---|---|
| `measure_receipt(window in {7, 30})` | anyone | `now >= settled_unix + window days`; field empty; reads the recipient's ATA raw amount (missing ATA = 0); writes |

Constants: `MAX_RATE_BPS = 5000`, `MAX_SLUG_LEN = 24`, `MAX_REASON_LEN = 200` (memo),
`ESCALATION_PERIOD = 90 days`, `FEED_MAX_AGE = 600 s`, `KEEPER_TIP = 500_000 lamports`.
`Goal`, multi-leg policies and drift are not part of Scrip v1.

### 5.3 The sweep transaction — atomic without a Jupiter CPI

A PDA can only sign inside a CPI, so a top-level Jupiter instruction cannot draw from a
program-owned escrow. The slice therefore passes through the keeper's own USDC account inside
one atomic transaction, and the program guarantees — with instruction introspection, the
same pattern flash-loan programs use — that the verifying instruction runs at the end. If it
does not, the first instruction refuses; if verification fails, everything reverts, including
the delegate transfer.

```
0  ComputeBudget           unit limit ~500k; unit price from a fee estimate
1  (Pyth post-update)      only if the on-chain feed is older than FEED_MAX_AGE
2  scrip.begin_sweep      compute the slice from on-chain state; delegate-transfer USDC → keeper's ATA
3  Jupiter setup           if any
4  Jupiter swap            USDC → asset, ExactIn = slice, user = keeper,
                           destinationTokenAccount = the owner's asset ATA, maxAccounts set, direct routes preferred
5  Jupiter cleanup         if any
6  scrip.finish_sweep     verify deltas against Pyth, write Receipt, pay the keeper from float
```

`begin_sweep` — accounts: keeper (signer), book, owner's USDC ATA, keeper's USDC ATA, owner's
asset ATA (created idempotently, rent advanced by the keeper), asset mint, token programs,
instructions sysvar.

```
require get_stack_height() == 1                                   // top-level only
require a finish_sweep for this book and release_id exists at a later index in this transaction
require exactly one begin_sweep in this transaction
require rule.enabled and pending is None
require float_lamports >= KEEPER_TIP + receipt_rent + ata_rent_if_created

bal = owner_usdc.amount
if bal < watermark { watermark = bal }                            // spending is not income
inbound = bal - watermark
require inbound >= min_inbound
taxable = cap > 0 ? min(inbound, cap) : inbound
rate    = min(MAX_RATE_BPS, rate_bps + escalate_bps * floor((now - enabled_unix) / 90d))
slice   = taxable * rate / 10_000
if floor > 0 { slice = min(slice, bal.saturating_sub(floor)) }     // never below the floor
require slice >= MIN_SLICE
require owner_usdc.delegate == book and owner_usdc.delegated_amount >= slice

watermark = bal - slice                                           // the remainder is the owner's, untaxed
token.transfer_checked(owner_usdc → keeper_usdc, slice, authority = book PDA)
pending = { release_id, slice, usdc_before: bal - slice, asset_before_raw: owner_asset.amount, slot }
```

`finish_sweep` — accounts: keeper (signer), book, owner's USDC ATA, owner's asset ATA, asset
mint, Pyth price account for the asset, receipt (init, payer = keeper), system program.

```
require pending is Some and matches this book
require owner_usdc.amount == pending.usdc_before                    // nothing else touched the owner's cash
price  = pyth(asset); require now - publish_time <= FEED_MAX_AGE; require conf/price <= 1%
p_hi   = price + conf
mult   = live scaled-UI multiplier of the mint (Token-2022 ScaledUiAmount: new_multiplier once its
         effective timestamp has passed, else multiplier; 1 for a plain SPL mint)
min_ui = slice_usd × (1 - tolerance) / p_hi
min_raw = min_ui / mult, in the mint's decimals
received_raw = owner_asset.amount - pending.asset_before_raw
require received_raw >= min_raw

write Receipt { kind: Sweep, basis_usdc: inbound, rate_bps: rate, paid_usdc: slice, amount_raw: received_raw, price_stamp }
book.lamports -= KEEPER_TIP + receipt_rent (+ ata_rent if the keeper created the ATA) → keeper
pending = None; sweeps += 1
```

Properties: the keeper chooses nothing about the amount; it cannot omit verification; it
cannot redirect output; its only discretion is the route, bounded by tolerance; its only
reward is the fixed tip. A second `begin_sweep` in the same transaction is refused; a
`finish_sweep` without a pending state fails.

### 5.4 The intake transaction

One versioned transaction signed by the payer, who is the fee payer.

```
0  ComputeBudget
1  Memo                    the reason
2  scrip.fund_payout      creates the Payout and the escrow ATA
3  Jupiter setup
4  Jupiter swap            USDC → asset, ExactIn = declared_usdc, destinationTokenAccount = escrow ATA
5  Jupiter cleanup
6  scrip.release_payout   min-out check, escrow → the recipient's ATA, Receipt, close escrow
```

`min_out_raw` comes from the Jupiter quote the payer saw, at 50 bps slippage. One asset per
Book means one swap per transaction, which fits with a lookup table for Scrip's fixed
accounts. If a route will not fit, the server requests fewer accounts or direct routes, and
if still not, the page says the route is unavailable right now.

### 5.5 Prices, stamps and multipliers

- The rule's protection is on-chain: min-out from Pyth net of confidence, converted to raw
  units with the live scaled-UI multiplier read from the mint. The keeper is untrusted.
- The intake's protection is the payer's own quote; the payer is trusting their own choice.
- A stale feed pauses sweeps; it never blocks the intake, where the Pyth stamp is optional.
- The pay page shows drift against the last NYSE print from the Pyth SPY feed when that feed
  is under a day old.

### 5.6 Rent and money

- Receipt ≈ 0.0028 SOL, permanent. Sweeps: advanced by the keeper, reimbursed from the
  owner's float. Intake: paid by the payer, shown on the pay page as "network + permanent
  receipt".
- Keeper tip 0.0005 SOL per sweep from the float. Per sweep ≈ 0.0034 SOL all in.
- Protocol fee in v1: zero, and the README says so. The field exists on the roadmap as basis
  points on the slice.

---

## 6. Keepers

Keepers are permissionless and open source. Scrip runs two. Anyone can run more; the tip
pays them.

- Watch every Book with the rule enabled: subscribe to the owner's USDC ATA; on a balance
  increase, compute the slice with the same formula as the program and skip if below
  minimums, allowance, or float.
- Fetch a Jupiter quote (ExactIn = slice, `destinationTokenAccount` = the owner's asset ATA,
  `maxAccounts` ~24, direct routes preferred). If the on-chain Pyth feed is older than the
  bound, post a fresh Hermes update in the same transaction.
- Assemble `[compute, (pyth), begin_sweep, jupiter…, finish_sweep]`, sign, send. On failure,
  re-quote and retry with backoff; if the feed is stale, wait.
- Report: last sweep time per Book, failures and reasons. The app reads this for
  "last sweep 3 min ago" and for the states in §7.2.

Off-chain attribution: the indexer reads the owner's USDC ATA transfer history between the
previous watermark and this sweep and attaches the senders to the receipt page, labeled
"attributed from the account's transfer history".

---

## 7. The app

Next.js 15 App Router, RSC by default, Wallet Standard. Production is mainnet only. The cache
file is `var/scrip.<cluster>.db`; a devnet row can never render under a mainnet chip. The
RPC is an archival provider (Helius or Triton) so any receipt signature resolves forever.

### 7.1 Public surfaces — no wallet, no account

**`/`** — The headline *Your income invests itself.* and one paragraph: "Set a rate once on
the wallet you already use. Payers keep sending USDC. A slice of every inflow becomes S&P 500
in the same wallet, with a receipt anyone can open." Two actions: *Turn on the rule* and
*Pay someone in stock*. Beside it, the one memorable object: a live mainnet receipt rendered
as a paper stub — "$200.00 landed · 10% became 0.0262 SPYx" — read from the ledger, never
fabricated. Below, the five-second version as one ruled block a judge can read without
scrolling:

```
 $500.00 USDC arrived
 $50.00 became 0.0654 SPYx        in the same wallet, 4 seconds later
 $450.00 stayed USDC              spendable, untouched
 Receipt                          still held: measured at 7 and 30 days
```

Then: "You're already getting paid. Investing shouldn't take another decision." Then how the
rule works in three steps (rate → arrival → stock; a real sequence); the evidence section
(the two studies, one paragraph); the honesty rows; the ledger strip; footer. The landing
never mentions the pay link before the rule.

**`/pay/<handle>`** — Intake. "Pay @shariq. Lands as SPYx in their own wallet, with a
receipt." Amount with presets, optional reason, a live quote (units, price, NYSE drift,
minimum that will land, network + receipt cost), a wallet button and a Solana Pay QR. States:
quoting, route too thin, stale-price note, signing, confirming, settled, failed ("Nothing
moved."). `?amount=&reason=` prefill. An address with no Book renders in sponsor mode. No
wallet is required to view.

**`/receipt/<signature>`** — Unshelled, print-like, reads the chain. For a sweep: "$200.00
landed" at the top, then "10% became" and the units at display size, "attributed to
7xKp…3f9a from the account's transfer history", the rate, the Pyth price used, the
tolerance, the keeper that submitted it. For intake: units at display size, the reason in
quotation marks, "$200.00 paid", to @handle from the payer. Both: *What arrived* with issuer
and disclosure chips; *Where it is anchored* (receipt account, transaction, slot, release id);
*Still held* at 7 and 30 days or the dates. Share copies the URL; `opengraph-image` renders
the stub. Footer: "This page is built from the chain, not from our database."

```
 ┌ - - - - - - - - - - - - - - - - ┐   perforated top edge
 │  Settled on Solana              │
 │                                 │
 │  $200.00 landed                 │
 │  10% became                     │
 │  0.0262 SPYx                    │   display size, mono, tabular
 │  15 Sep 2026, 09:13 UTC         │
 │  in @shariq's wallet            │
 │ ─────────────────────────────── │
 │  From (transfer history)        │
 │  7xKp…3f9a   $200.00            │
 │ ─────────────────────────────── │
 │  Price  $764.10 · Pyth · 48s    │
 │  Min    0.0259 SPYx (1.00%)     │
 │ ─────────────────────────────── │
 │  Still held                     │
 │  7 days    measured 22 Sep      │
 │  30 days   measured 15 Oct      │
 │ ─────────────────────────────── │
 │  Receipt  23ty…82Yq             │
 │  Tx       3vLM…9nzA             │
 └─────────────────────────────────┘
```

**`/claim/<release_id>`** — Sponsored positions. "0.2617 SPYx is waiting for you, from
@shariq." One action: *Claim into your wallet*. Opens a Book in the same transaction if
needed; fee-sponsored; the claim secret stays in the URL fragment.

**`/ledger`** — Sweeps and payments in one stream. Stats in sentence case: receipts, value
converted, units delivered, wallets with the rule on, keep-rate at 7 days (and 30 when it
exists). A table on desktop, two-line rows on mobile, each linking to its receipt.

**`/assets`**, **`/docs`** — as before; docs gain "how the rule sees money" and "what a
keeper can and cannot do".

### 7.2 Owner surfaces — wallet signature

**`/app`** — Home. The rule card first: "10% of every arrival → SPYx · on · last sweep 3 min
ago · allowance $840 left · float 0.03 SOL" with *Pause* and *Change*. Then arrivals: sweeps
and payments, each with basis, slice, units, receipt link. Then holdings, units first, dollars
second, adjusted quantity shown and raw on tap. Then "Of what arrived, you still hold X%."
Then the pay link with a copy button and QR, as the secondary object.

**`/app/rule`** — Turn on, change, pause. The screen's heading is the frame: "Choose the
share of your income you never want to think about again." Rate as three large presets and
a slider to 50% — a habit, never a trading setting; asset; optional floor and cap; escalation as one checkbox ("add 1% every three months");
the allowance with a plain explanation of what the delegate can and cannot do; the float with
"about N sweeps". One signature: `enable_rule` + `approve_checked` + float transfer. Pause is
`revoke`, and the screen says: "Pausing is a token-program revoke. Scrip cannot stop you."
States the card must render: on; paused (revoked); paused because another app replaced the
delegate; allowance exhausted (re-approve); float empty (top up); waiting for a fresh price;
no USDC account yet.

**`/app/request`** — Build a request link with amount and reason; copy or QR.

**`/app/send`** — Pay a handle or an address from the owner's own USDC; an address without a
Book becomes a sponsored position with a claim link. "Convert some now" is paying your own
link.

The wallet gate applies to `/app*` only; on a phone without an extension it offers *Open in
Phantom / Solflare / Backpack*. Pay, receipt, claim and ledger never gate.

### 7.3 Routes and jobs

- `GET /api/pay/quote`, `POST /api/pay/tx` — intake quote and transaction.
- `GET | POST /api/solana-pay/<handle>` — Solana Pay transaction request; the QR encodes
  `solana:<this URL>?amount=&reason=&rid=`; the page watches the Payout for `rid`.
- `POST /api/rule/tx` — builds the enable / change / pause / resume transactions.
- `GET /api/rule/status/<owner>` — delegate state, allowance, float, last sweep, keeper
  health.
- `GET /api/handle/<slug>`, `/api/session/*` — as before.
- `POST /api/maintenance` — index receipts incrementally (a test proves the second run adds
  rows); attribute sweeps from transfer history; call `measure_receipt` at 7 and 30 days.
- Keepers run as a separate service (§6), two instances, with a health endpoint the app reads.
- Relayer: fee-pays claims; rate-limited.

---

## 8. Keep-rate

Recorded at release, measured on chain at 7 and 30 days by anyone, computed from raw units so
a rebase never looks like a sale. Per recipient, over receipts whose window has been
measured:

```
held      = min( balance_raw_at_measure , Σ amount_raw over those receipts )
keep-rate = Σ held × price_at_release  /  Σ amount_raw × price_at_release
```

where `price_at_release` is `paid_usdc ÷ amount_raw` on the receipt. The 7-day figure exists
from the first measurement; the 30-day figure appears when the first receipt is that old.
Before a window matures the UI states the date, never a placeholder number.

---

## 9. Design system and UX direction

Keep the rules of the existing system — tokens as the only source of design values, no
utility classes, money colors for money outcomes only, one accent, mono tabular figures,
radii 6 / 10 / 16, lucide line icons, motion tokens that collapse under reduced motion,
server-first — and re-aim it at the subject.

**The subject is a receipt.** The materials are paper, ink, ruled ledger lines and the
perforated edge of a pay stub. Spend the boldness in one place: the stub — in the hero, at
the end of every conversion, in the share image, in the ledger. Everything else is quiet.

**Palette**

```
paper        #f7f5ef    surface     #ffffff    rule         #e4dfd3    rule-strong  #cdc5b4
ink          #14161c    ink-muted   #5a5d66    ink-faint    #8b8e97
accent       #2b4acb    accent-strong  #1f3aa8    accent-soft  #e8edfb    — document blue
ok  #15803d   err  #dc2626   warn  #b45309                                — money outcomes only
gold         #9a6f1e                                                       — the GOLD chip only
```

**Type.** Words: Instrument Sans, 400 / 500 / 600. Figures: IBM Plex Mono, tabular, at every
size. Units are the largest thing on any page they appear on. Lines under 80 characters.
Sentence case everywhere.

**Layout.** Left-aligned; single column on mobile; a 720 px column for reading; a two-column
pay page on desktop. The stub is a white sheet on paper with a perforated top edge. Rules
encode rows. No decorative borders, no grid of identical cards with the same shadow, no
gradient washes.

**Motion.** One moment: when a conversion lands, the stub prints — a single 320 ms rise on
the spring token — and the real units appear. Nothing fades up on scroll. Hover changes
color, not position.

**Copy.** Active voice. A button says what happens — *Turn on the rule*, *Pause*, *Pay $200*,
*Claim into your wallet* — and the confirmation uses the same word. Errors say what happened
and what to do; empty states say what will fill them. Units before dollars.

**Gone:** the single accent-colored word in a headline; all-caps eyebrows and stat labels;
meta strings joined with middle dots; arrows appended to buttons; fade-and-slide on every
section; hover lifts on every card.

**Floor.** 375 px works: the mode pill has a scrim, stats reflow, nothing runs under the
bottom bar. Visible focus, AA contrast, reduced motion respected. The receipt page ships no
client JavaScript except the copy button. LCP under 1.5 s on the pay page over 4G.

---

## 10. Words that are and are not used

Say: rule; rate; slice; "a slice of the net increase since the last sweep"; units; tracker
certificate; "issued by Backed"; "the issuer can freeze and move these tokens"; "dividends
are reinvested, not paid"; "in your own wallet"; "measured on chain"; "pausing is a revoke".

Never say: brokerage; advice; "we invest for you"; "you own Apple"; projected income or
yield; guaranteed; stable; "our custody"; "every dollar" without "net". Never show a number
not derived from chain state. Disclosure is per row, never a banner.

---

## 11. Definition of done

A judge with a phone, on 18 September and again on 2 October:

- sends 5 USDC from their own wallet to Shariq's normal Solana address — no Scrip tab, no
  link — and within seconds sees SPYx appear in Shariq's wallet, a receipt at
  `/receipt/<sig>`, and the ledger tick;
- opens `/pay/shariq`, pays $5 with a wallet or by scanning the QR with a phone wallet, and
  lands on a receipt with their address and their reason on it;
- opens `/app/rule` on the founder's account and sees the rule on, the allowance, the float,
  the last sweep time, and a *Pause* that is a revoke;
- opens `/ledger` and sees receipts from wallets that are not the founder's — sweeps and
  payments — each existing on the cluster the chip claims;
- sees a 7-day keep-rate that is a number, with its method one link away;
- pays an address that has never used Scrip and sees the claim work from an empty wallet;
- reads on `/assets` what the issuer can do and what dividends are;
- finds nothing that says Webgold, gold-first, brokerage, or advice.

And: the offline suite covers the slice formula (watermark, cap, floor, escalation), the
introspection guard, the multiplier conversion, the intake builder, the memo hash, and
keep-rate deduplication; the on-chain battery runs against mainnet with $1–$5 amounts through
both the sweep and the intake path; two keepers are running; the indexer's second run adds
rows; `lint`, `typecheck` and `build` are clean.

---

## 12. How it is presented

**The video, two minutes, phone in frame, mainnet, real dollars.** Phone A shows Phantom
with USDC. Phone B shows Shariq's Scrip home: the rule on, 10%, SPYx. Phone A sends 20
USDC to Shariq's address — a normal transfer, no Scrip anywhere on that phone. Phone B: the
arrival appears, then the sweep, then 0.0026 SPYx in the holdings; Phantom on Phone B shows
the new SPYx balance. The receipt opens on a third device with no session. The ledger ticks.
Closing line: "The payer sent dollars to a normal address. The recipient never opened an
exchange and never made a decision. Ten percent of it is the S&P 500 in their own wallet,
with a receipt anyone can open, and in seven days the chain will record whether it's still
there. This is the 401(k) for stablecoin income."

One rule for the film: **the pay link never appears in the rule demo.** A demo that starts
with "copy your Scrip address" has just told the judge the payer changes behaviour, which
is the objection the product exists to answer. The address on Phone A is the same address the
payer has always used.

Positioning, in the video and the README: never sell "automatic investing" — that is a
feature every robo has. Sell the absence of a decision: *your income invests itself*; *you're
already getting paid, investing shouldn't take another decision.* The pain is quieter than
"I need $500 and won't sell" and it is far more common; the copy has to carry that.

If the rule is not live on mainnet on the founder's own wallets by the time of filming, the
video shows the intake path with the same closing line minus the first sentence, and the
README states the rule as what turns on next. A working intake beats a rule that reverts on
camera. But the submission is the rule either way.

**README, top of the repository.** The user and the problem in four lines. The one-sentence
product. A real receipt screenshot. *Try it*: the founder's address with the rule on, and the
pay link. Mainnet program id, keeper addresses, registry mints, ten example signatures. How
the rule sees money (watermark, cap, floor, net not gross). What a keeper can and cannot do,
in five lines. How the sweep transaction is atomic without a Jupiter CPI (introspection,
delta verification, Pyth min-out with the live multiplier). The keep-rate method. What is not
built: mixes, round-ups, the embedded-wallet door. Engineering notes: the multiplier finding
(the obvious field reads 0.18% low; activation observed at 04:00 UTC), per-feed Pyth
staleness, per-leg token programs, the Borsh field-name defect. The moat, before a judge
says it: a wallet could ship this; what it would not have is receipts anyone can open, a
keep-rate measured on chain, permissionless keepers, correct corporate-action accounting,
and real wallets first. Business model in one sentence.

**Submission text, under 80 words.** "Scrip is a rule on your wallet. Set a rate once on
the Solana address you already use; a slice of every USDC that lands becomes S&P 500 in the
same wallet, with a permanent receipt and a keep-rate measured on chain at 7 and 30 days.
Non-custodial: pausing is a token-program revoke. Payers keep sending dollars. Live on
mainnet with real receipts."

---

## 13. Settled decisions

| Decision | Evidence |
|---|---|
| The rule is the product; the link is intake | A link asks both sides to change a habit; a rule on a normal address asks nothing of the payer. "Why not send USDC?" is answered only by the rule. |
| A rate, not 100% | A 401(k) is 5–15% of a paycheck. 100% locks income and forces a front-run story and a pause toggle as the escape valve. |
| Default 10%, presets 5 / 10 / 20, max 50% | Pay-yourself-first norms; Save More Tomorrow escalation as an option. |
| No Jupiter CPI | Routes are variable-account and move; a top-level swap with introspection and delta verification is atomic, trustless and far simpler. |
| Slice passes through the keeper's account inside one transaction | A PDA cannot sign a top-level Jupiter instruction; the flash-loan pattern makes the pass-through safe. |
| Min-out from Pyth net of confidence, converted with the live multiplier | The keeper is untrusted; the token account is raw units; xStocks rebase. |
| Net increase since last sweep, not gross inbound | The only thing verifiable on chain without trusting a keeper. Said plainly in the UI. |
| Swap proceeds count as inbound; a cap protects treasury moves | The crypto-native feature: profits leave the casino. |
| One asset per Book in v1 | One swap always fits one transaction on both paths; mixes are a defined extension. |
| Pause is `revoke` | The program cannot prevent it; that sentence is the trust model. |
| Float on the Book pays receipts and tips | Permissionless keepers need an on-chain reason to exist; owners pay for their own permanent records, transparently. |
| Not a lender | Kamino has run xStocks lending since July 2025 and holds ~83% of that market; "why not Kamino?" has no answer. |
| Not gold-first | A stocks hackathon. Gold is one option. |
| A 7-day window alongside 30 | No receipt created now is 30 days old before judging ends. |
| Accent leaves gold; type leaves Inter | The subject is a receipt, not bullion. |
| Not: trading UI, borrowing, card, social, DBC launchpad, agents, goals, mixes, round-ups, the email door in v1 | Occupied, partner-gated, retention-hostile, bounty-shaped, or roadmap. |

---

## 14. Why this beats Webgold, and the field

Webgold asked the payer to already hold GOLD and SPYx, put 70% metal in a stocks hackathon,
named four users, and read as a protocol. Its true insight — ownership can arrive in a wallet
the recipient already has — survives here with the intake asset changed to what payers hold,
the default changed to what the hackathon is about, and the arrival changed from "a payer
used our escrow" to "money landed, as it always does."

The field is venues: terminals, baskets, DCA, tips, agents, stock-paired launches, lending
that Kamino already does. Every one assumes a person who has already decided to invest.
Scrip is for the person who never will, which is most of the wallets that already hold these
tokens by accident. The mechanism has decades of evidence and tens of millions of users in
its off-chain form; its on-chain form is empty. The demo is a normal transfer to a normal
address, and stock appearing three seconds later. Nothing else in the field can film that.

---

## 15. After Stocklana — the company

- **Mixes.** `begin_sweep` locks per-asset owed amounts at the watermark; each asset sweeps in
  its own atomic transaction; policy changes require owed to be zero.
- **Round-ups.** Outbound USDC payments round up to the dollar into the asset — the second
  rule type, once outbound attribution is verifiable enough to state honestly.
- **The embedded-wallet door.** Claims and rules for people without Phantom.
- **The organisation surface.** One integration for a grant program or payroll provider;
  each recipient on their own rate. This is the distribution channel.
- **Backpack mint and redeem** as a second fill venue for keepers: primary issuance, no
  slippage.
- **Cross-chain arrivals** via Jupiter Universal Deposit: a payer on another chain sends;
  the stock still lands on Solana.
- **Yield** through Kamino and Kraken vaults; **credit** against what arrived, integrated
  from Kamino, never rebuilt.
- **Multisig, then freeze** of the upgrade authority.

The expansion, as told at the World's Fair, is one sequence with the same standing
instruction at every step: a slice into the S&P 500 today; a slice into a mix tomorrow; a
slice into a reserve or a set-aside, so a freelancer's inflow splits itself into stock, cash
and what they owe; then the same rule on a grant program's or an agent's treasury. Each step
is the rule with one more destination, never a new product. The pitch names the person at
every step and never becomes "programmable money routing."

Business: zero fee in v1; then basis points on the slice, and a share of yield. Channels:
grant programs, bounty platforms, stablecoin payroll providers. The data nobody else has: the
moment of arrival, per wallet, with a receipt and an on-chain keep-rate.

---

## 16. Risks, in the README

- Delegate approvals unsettle some users. The allowance is capped and chosen by the owner;
  the screen says what the delegate can and cannot do; the build is verifiable; pausing is
  a revoke.
- Keeper liveness is a silent failure. Two instances, permissionless tips, and "last sweep"
  visible on the home screen.
- Another app can replace the delegate on the USDC account and silently pause the rule. The
  app detects and says so.
- The rule sees net increase, not gross inbound; money spent before a sweep is not taxed.
  Stated in the interface.
- After-hours single-name liquidity is thin. Defaults are SPYx and QQQx; the tolerance is
  shown.
- xStocks carry a permanent delegate and a pause authority; self-custody here means not our
  custody. xStocks are not offered to US persons; the owner attests eligibility.
- A wallet could ship this. Wallets are neutral and rarely push a securities conversion;
  the moat is receipts, on-chain keep-rate, permissionless keepers, and real wallets first.
- The program is upgradeable by the deployer key until the multisig.

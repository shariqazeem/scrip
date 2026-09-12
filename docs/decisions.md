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

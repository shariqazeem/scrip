# Webgold — the product, explained properly

## The confusion this document removes

We rotated through five ideas before locking this one. If you are reading the history and
feel lost, here is the whole thing in one paragraph:

> **Webgold is an account.** You put USDC in. It becomes a real portfolio — the stock
> market plus gold and silver — that sits in **your own wallet**, not ours. The account
> keeps that portfolio honest through dividends and splits, earns on it where it safely
> can, lets you pay another person straight into their account, and prints a public
> receipt for every single move. That is it. Everything else is a later module.

## Who it is for, concretely

A person who already holds a Solana wallet. Their net worth is SOL, a couple of tokens,
and USDC. Every asset they own moves together, and the "safe" one loses a few percent of
its purchasing power every year. They cannot open a brokerage account without a residency,
a bank and a KYC flow they will never complete. They have no interest in becoming a
trader, and no product currently asks them to be anything else.

That person does not need a better chart. They need somewhere for the money to live.

## The four things the account does

1. **Holds.** A default mix across an equity sleeve and a metal sleeve, fixed so that
   nobody has to have an opinion. Positions land in the user's own token accounts.
2. **Stays correct.** Dividends and splits rebase tokenized-stock balances. The account
   tracks multiplier-adjusted quantity and basis so returns and cost basis stay true. Most
   products in this category will get this wrong; see `architecture.md`.
3. **Earns where it can.** Gold leasing yield, equity lending yield. Low single digits,
   stated honestly, never the headline.
4. **Pays.** Send value to another person and it arrives in their account as the same real
   assets, with a receipt. If they have no account, the link creates one.

## What we are deliberately not building

| Not this | Why |
| --- | --- |
| Trading terminal, perps, pair trading | The founder is not a trader, and the venues exist |
| Copy trading, PnL cards, leaderboards | Requires a trader graph we do not have; Dub already took the category |
| Permissionless index/ETF factory | Contested (Symmetry 350+ baskets, Reserve DTFs), and Index Coop fell from ~$44M to ~$14M |
| Yield vault ("deposit for APY") | Superform and apys both shipped it in the same week |
| Trading agent under a mandate | Lost twice already, on two different chains |
| Invoicing / payroll / B2B compensation | Reads as Deel; spends the pitch on tax and compliance |
| SDK with no app on top | Infrastructure that looks like infrastructure |

## The wedge, stated so it can be executed

**Sponsored first position.** A new holder's first slice of gold or the market is funded by
an issuer, not by us. They must hold it inside the account. The account is what they keep.

The mechanic is employer matching, which is the best-evidenced acquisition device in
consumer finance: plans with automatic enrollment run 94% participation against 64% for
voluntary ones. No crypto product has copied it. The budget already exists on the other
side of the table — Kraken runs xPoints, Jupiter has run six-figure xStocks reward
programs, and issuers compete for holders.

Bootstrap order: seed the first cohort ourselves so there is something real to show, then
convert to issuer money before the Colosseum deadline.

## Why people come back without a prize

Three reasons, in order of strength:

- **Their money lives there.** A balance is a reason to return that costs nothing to
  maintain.
- **It grows and it pays.** A visible balance that moves, plus small periodic yield.
- **They were paid into it.** Every payment creates a new account holder who did not have
  to decide to invest.

## The metrics that will decide both competitions

Not vanity. These are the numbers to instrument on day one, because they are the submission:

- reserves opened, and how many were funded by a sponsor versus self-funded
- total value held, and 30-day hold rate (the single best signal that this is savings and
  not farming)
- payments settled, and distinct recipients
- receipts published
- week-over-week returning accounts

## The founder's own loop

The founder is user zero, the way he is on Sage. His own operating treasury sits in a
Webgold reserve instead of decaying as USDC, payouts go out of it, and the receipts get
posted publicly. That is honest dogfooding, not subsidy — the product's growth engine is
the sponsored position, not his wallet.

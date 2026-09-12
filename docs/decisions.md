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

## Open questions

- Sponsor outreach timing: before there are holders, or after?
- Email/embedded wallet on day one (Privy) or wallet-only for v1?
- Does the public ledger show individual reserves, or only aggregates?

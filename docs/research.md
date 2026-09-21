# Research backing (2026-09-12, extended 2026-09-15)

Every claim used to justify the product, with its source. Re-verify before quoting any of
these in a submission or a pitch — this file is a snapshot, not a live feed.

## The behavioural evidence for a rule on income (the wedge)

| Fact | Figure | Source |
| --- | --- | --- |
| Automatic enrollment raised 401(k) participation among new hires | from 37% to 86% | Madrian, B. & Shea, D. (2001), "The Power of Suggestion: Inertia in 401(k) Participation and Savings Behavior", *Quarterly Journal of Economics* 116(4) |
| Save More Tomorrow: binding contribution increases to pay raises | average saving rate 3.5% → 13.6% over forty months | Thaler, R. & Benartzi, S. (2004), "Save More Tomorrow", *Journal of Political Economy* 112(S1) |
| Participation, automatic vs voluntary enrollment | 94% vs 64% | [Vanguard, How America Saves 2025](https://www.investmentnews.com/retirement-planning/auto-enrollment-retirement-plan-adoption-rates-hit-new-highs-in-2025-says-vanguard/267032) |
| Acorns and Robinhood's direct-deposit split | tens of millions of users on a product whose UX is "do nothing"; both need a US bank and a US brokerage | Acorns and Robinhood product pages |

## Why now

| Fact | Source |
| --- | --- |
| Nasdaq's venture arm invested $100M in Kraken's parent; Nasdaq Equity Tokens planned on the xStocks platform in Q2 2027; SEC approval in hand for certain stocks to trade and settle in tokenized form | Reuters, 2026-09-10 (as cited in `docs/scrip.md` §1; re-verify the URL before quoting) |

## Measured on 2026-09-15, while building Scrip

| Fact | Measurement |
| --- | --- |
| Hermes requires an API key | `GET /v2/updates/price/latest` → 401 without one; Pyth docs: required since 2026-08-26, `Authorization: Bearer` |
| The on-chain sponsored `Crypto.SPYX/USD` account | 234,350 seconds (65 h) stale at 07:25 UTC |
| The on-chain `Crypto.USDC/USD` and `Crypto.SOL/USD` accounts | 20 s and 50 s old on mainnet; 61 s on devnet, same addresses |
| xStocks multiplier activations | SPYx 04:00 UTC; NVDAx, AAPLx, GOOGLx, MSFTx 00:30 UTC; QQQx, METAx 23:55 UTC the day before; TSLAx, AMZNx, MSTRx, COINx, CRCLx, HOODx at 1.0 with no activation yet |
| Every xStocks mint's extensions | MetadataPointer, PermanentDelegate, DefaultAccountState, ScaledUiAmountConfig, PausableConfig, ConfidentialTransferMint, TransferHook (system program = disabled), TokenMetadata; freeze authority set; permanent delegate `5aMNNLQJ…` on every one |
| Jupiter depth, liquidity / 24 h volume | SPYx $3.69M / $27.4M; CRCLx $2.29M / $11.2M; NVDAx $1.72M / $7.2M; QQQx $1.68M / $3.4M; MSFTx $0.55M / $5.3M; GOLD $0.38M / $0.28M |
| A Solana program's stack frame | 4 KiB; a context with a dozen deserialized accounts overflowed it and produced garbage pointers on devnet until the accounts were boxed |
| The public devnet faucet | rate-limited for the deployer at 2 SOL per request after two requests in a day; Ankr and Alchemy devnet endpoints refuse `requestAirdrop` without a key |


## The market exists and it is on Solana

| Fact | Figure | Source |
| --- | --- | --- |
| Solana tokenized-stock volume, H1 2026 | $4.9B, up 6x from $775M in H2 2025 | [KuCoin](https://www.kucoin.com/news/flash/solana-tokenized-stocks-volume-hits-4-9b-in-h1-2026) |
| Q2 2026 tokenized asset spot volume | $5.77B, quarterly ATH | [Yahoo Finance](https://finance.yahoo.com/markets/crypto/articles/solana-news-solana-hits-5-132000556.html) |
| Solana share of on-chain tokenized equity volume | ~95%+ | [Solana](https://solana.com/tokenized-equities) |
| Tokenized equity supply on Solana | ~$684M ATH | [news.bitcoin.com](https://news.bitcoin.com/defi/solana-tokenized-stocks-hit-record-684m-as-trading-surges/) |
| xStocks scale | 700+ names, ~$800M AUM; acquired by Kraken Dec 2025 | [Crypto Briefing](https://cryptobriefing.com/xstocks-790m-tokenized-assets-blockchains/) |
| Ondo Global Markets on Solana | 250+ stocks and ETFs incl. commodity ETFs (SLV, IAU) | [Solana](https://solana.com/news/ondo-global-markets-tokenized-stocks-etfs-solana) |

**The holder gap, which is the whole thesis:** billions in volume against roughly 57,000
unique xStocks holders as of January 2026. The category has traders, not owners.

## Metals on Solana are the fastest-growing corner

| Fact | Figure | Source |
| --- | --- | --- |
| Gold + silver token market cap growth on Solana, 12 months to Aug 2026 | **+689%**, ~2x the next-fastest chain | [Solana Compass](https://solanacompass.com/news/solanas-tokenized-gold-market-cap-grew-689-in-a-year-outpacing-every-other-chain) |
| Oro GOLD | 1 troy oz, Brinks Dubai, RSM-audited monthly, **3–4% yield from gold leasing** | [Solana](https://solana.com/news/tokenizing-gold-inside-oro-s-vertically-integrated-bet) |
| Matrixdock XAUm | LBMA-grade, launched on Solana Feb 2026, Raydium liquidity | [Solana](https://solana.com/news/matrixdock-xaum-launch) |
| PAXG | native on Solana since June 2026 | [Paxos](https://www.paxos.com/blog/bringing-paxg-to-solana) |
| Retail gold demand, Q1 2026 | 474 tonnes bar and coin, second highest on record | [World Gold Council](https://www.gold.org/goldhub/research/gold-demand-trends/gold-demand-trends-q1-2026) |

## The corporate-action problem (the moat)

| Fact | Source |
| --- | --- |
| xStocks rebases balances via an on-chain **multiplier**, published before each ex-date, activated 00:30 UTC the day after; dividends are reinvested, not paid | [xStocks docs](https://docs.xstocks.fi/developers/multipliers) |
| xStocks confer no shareholder rights; dividend economics arrive as a balance adjustment | [Kraken](https://support.kraken.com/articles/xstocks-faq) |
| Ondo reinvests dividends; on Solana the value shows through Scaled UI as more tokens | [Bitget academy](https://www.bitget.com/academy/ondo-global-markets-faq) |
| Public issuer API exposing assets, prices, **multipliers**, proof of reserves, oracles, corporate actions, no auth | `docs.xstocks.fi/apis/openapi` |

Consequence: there is **no equity income on-chain**, and any product computing returns from
raw balances is wrong from the first ex-date.

## The behavioural evidence for the wedge

| Fact | Figure | Source |
| --- | --- | --- |
| Participation, automatic vs voluntary enrollment | **94% vs 64%** | [InvestmentNews on Vanguard 2025](https://www.investmentnews.com/retirement-planning/auto-enrollment-retirement-plan-adoption-rates-hit-new-highs-in-2025-says-vanguard/267032) |
| The default effect: enrollment more than doubles participation, and people keep the default allocation | — | [Madrian & Shea, NBER w7682](https://www.nber.org/system/files/working_papers/w7682/w7682.pdf) |
| Passive share of US long-term fund assets | 53.8% | [Statista / ICI](https://www.statista.com/statistics/1262209/active-passive-investment-funds-usa/) |

Issuers already buy distribution: Kraken runs xPoints for xStocks holders, and Jupiter has
run six-figure xStocks reward campaigns. That is the budget the sponsored first position
draws on.

## Competitive field, checked 2026-09-12

| Player | What they own | Distance from Webgold |
| --- | --- | --- |
| Jupiter, Raydium, Meteora, Orca | routing and liquidity | we route through them |
| Kamino | 82.6% of tokenized-stock lending, $31M of $53M collateral | we deposit into them |
| Glider (a16z CSX) | automated portfolios with Ondo stocks + gold | closest adjacent; portfolio engine, not an account, no pay rail |
| Symmetry, Reserve DTFs, basketsolana, Lore Mag7 | baskets and index factories | supply-side; Index Coop's fall from ~$44M to ~$14M is the warning |
| Superform (Base), apys (Solana) | earn on deposited tokenized stocks | yield as a product; wrong chain / just launched |
| Dub ($30M Series A), Copystock | copy trading | requires a trader graph |
| Receipt | stock rewards on purchases | spend-side |
| x402stock, Massive, xStocker | agent data and trading SDKs | infra for agents |
| Glint (240k users, £310M vaulted), Kinesis (~80k) | gold as money | **proof of demand**: custodial, fiat-rail, no equities, not on Solana |

Glint and Kinesis are the two most important rows. They prove people want a metal account
at real scale, and they prove nobody has built one where the assets already live.

## The competitions

- **Stocklana**: $100K, submissions close 18 Sep 20:00 UTC, judged through 2 Oct. One
  question: could this be a real app people use. Real use case, works end to end,
  Solana-native, execution.
- **Crypto World's Fair (Colosseum)**: 14 Sep to 12 Oct, cross-chain, millions in prizes and
  pre-seed. Stocklana submissions are eligible. Judges are investors: MVP, user acquisition,
  monetization, team. Winners can enter the accelerator with $250K.

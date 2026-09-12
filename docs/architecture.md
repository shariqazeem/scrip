# Architecture

## The shape

```
   payer ──escrow──►┌──────────────┐──release──►  recipient's own wallet
                    │  Payout PDA  │              (gold · silver · equity)
                    │ the ONLY     │                      │
                    │ thing the    │                      ▼
                    │ program      │              ┌──────────────┐
                    │ ever holds   │              │   Book PDA   │  policy + stats
                    └──────┬───────┘              │ holds NO     │
                           │                      │ assets       │
                           └────── emits ────────►└──────┬───────┘
                                                         │
                                              ┌──────────▼──────────┐
                                              │  Receipt PDA        │
                                              │  what · who · why   │
                                              └─────────────────────┘
        Jupiter routes · Pyth values · issuers publish multipliers
```

Two rules that do not bend:

1. **The program holds assets only while they are under a rule.** An escrowed payout, and
   nothing else. A settled position sits in the recipient's own token account. A pooled
   claim on a basket of tokenized securities would be a fund; direct ownership is not.
2. **The program never decides who deserves money.** A payout carries a payer, recipients,
   amounts and a reason string. Verification happens somewhere else, or nowhere.

## The core objects

| Account | Seeds | Holds |
| --- | --- | --- |
| `Book` | `[b"book", owner]` | owner, mix policy, opened_at, lifetime received/sent, goals |
| `Payout` | `[b"payout", payer, nonce]` | escrowed assets, recipients, amounts, reason, release rule |
| `Receipt` | `[b"receipt", payout, recipient]` | what moved, from whom, why, when, reference |
| `Goal` (v2) | `[b"goal", book, slug]` | name, target, skim bps, accumulated |

`Receipt` being an on-chain account rather than only an event is deliberate. **The named
arrival is the product.** A memory that lives only in our database is a memory we can lose
or be accused of inventing; one that lives on chain can be opened by anyone, forever, and
survives us.

## Instructions

| Instruction | Signer | Effect |
| --- | --- | --- |
| `open_book(policy)` | owner | creates the book |
| `set_policy(policy)` | owner | mix weights, must sum to 10,000 bps |
| `fund_payout(legs, recipients, reason)` | payer | escrows the assets |
| `release_payout(payout)` | payer or rule | transfers to recipients, writes receipts |
| `cancel_payout(payout)` | payer | returns escrow, only while unreleased |
| `send_named(to, legs, note)` | owner | a named transfer with a receipt |
| `claim_sponsored(sponsorship)` | new owner | the first position |
| `set_goal(slug, target, skim_bps)` (v2) | owner | the sweep on inbound |

## Asset realities that constrain the design

Checked against the live issuers on 2026-09-12. These are not optional details; each one
changes what we build.

| Fact | Consequence |
| --- | --- |
| xStocks mints carry **Permanent Delegate** and **Pausable** | The issuer can transfer, burn or freeze. We must disclose this plainly on the asset row and in docs. Self-custody here means "not our custody", not "nobody can touch it" |
| xStocks use **Scaled UI Amount Config**, a mint-level multiplier for dividends and splits | Raw balances change on ex-dates. Every displayed number and every cost basis must be computed against the current multiplier, or a dividend reads as a gain and a split as a 300% return |
| **Transfer Hook** is initialized but disabled | Compliance logic could switch on later and would then run on every transfer. Design transfers so a hook cannot break them |
| **Confidential Balances** is initialized but disabled, and cannot be active alongside a transfer hook | Encrypted balances are an issuer decision we do not control. Keep the path in the design, never in the pitch |
| Dividends are **reinvested**, not paid | There is no equity income on chain. Never show an expected dividend |

## Off-chain services

| Service | Job |
| --- | --- |
| **Allocator** | USDC or a payer's funding → Jupiter quotes per leg → escrow bundle. Refuses outside a Pyth-checked slippage bound |
| **Valuer** | Pyth for price, issuer multiplier for quantity. NAV and grams |
| **Multiplier watcher** | Polls issuer multipliers, reconciles adjusted quantity and basis, publishes a reconciliation receipt |
| **Receipt indexer** | Mirrors on-chain receipts for fast pages at `/receipt/<sig>` |
| **Cohort tracker** | Records every payout recipient and their balance at day 0, so keep-rate at day 30 is measurable rather than guessed |

## Data model

```
books        owner, pda, policy_json, opened_at
positions    book, mint, qty_raw, qty_adjusted, cost_basis_base, multiplier_at_entry
payouts      pda, payer, legs_json, reason, funded_at, released_at
receipts     pda, sig, payout, recipient, legs_json, reason, at
transfers    sig, from_book, to_owner, legs_json, note, at
multipliers  mint, value, effective_at, source, seen_at
sponsorships sponsor, mint, amount_base, claimed_by, claimed_at
cohorts      recipient, payout, value_at_release_base, measured_at, value_now_base
goals        book, slug, target_base, skim_bps, accumulated_base
```

## Failure policy

Every service returns a value and never throws for control flow. A stale price, a missing
multiplier, a failed quote: each one **holds and says why**. Nothing guesses with money.
Carried directly from Sage, where it is the reason a failed judgment never corrupted a
payout.

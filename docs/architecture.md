# Architecture

## The shape in one picture

```
        user's wallet  ──────────────────────────────┐
              │  owns every position directly         │
              ▼                                       │
  ┌───────────────────────┐    signs    ┌──────────────────────┐
  │  Reserve PDA          │◄────────────│  the person          │
  │  policy + receipts    │             └──────────────────────┘
  │  never holds assets   │
  └───────────┬───────────┘
              │ emits events
              ▼
  ┌───────────────────────────────────────────────────────────┐
  │ off-chain: allocator · valuer · corporate-action watcher  │
  │            yield router · pay rail · receipt writer       │
  └───────────┬───────────────────────────┬───────────────────┘
              │                           │
         Jupiter (routing)           Pyth (valuation)
                                     issuer APIs (multipliers)
```

The single most important line: **the program never holds the assets.** It holds the
policy and emits the record. A pooled claim on a basket of tokenized securities is a fund;
direct ownership of the constituents is not. This is a legal decision expressed as an
architectural one, and it is not negotiable without an explicit instruction.

## On-chain — the `webgold` Anchor program

### Accounts

```rust
#[account]
pub struct Reserve {
    pub owner: Pubkey,
    pub bump: u8,
    pub version: u16,
    pub policy: Policy,
    pub opened_at: i64,
    pub last_rebalance_at: i64,
    pub lifetime_funded_base: u64,   // 6dp USD
    pub lifetime_paid_base: u64,
}

pub struct Policy {
    pub legs: Vec<Leg>,          // (mint, target_bps) — must sum to 10_000
    pub drift_band_bps: u16,     // rebalance only outside this band
    pub cadence_secs: u32,       // 0 = manual only
}
```

Seeds: `[b"reserve", owner.as_ref()]`.

### Instructions

| Instruction | Signer | Effect |
| --- | --- | --- |
| `open_reserve(policy)` | owner | creates the PDA, emits `ReserveOpened` |
| `set_policy(policy)` | owner | replaces weights, emits `PolicyChanged` |
| `record_allocation(legs)` | owner | emits `Allocated` in the same tx as the swaps |
| `record_payment(to, legs)` | owner | emits `Paid` |
| `close_reserve` | owner | emits `ReserveClosed` |

**Invariant enforced on-chain:** `legs.iter().map(target_bps).sum() == 10_000`, every mint
is on the whitelist, and `legs.len() <= MAX_LEGS`. A policy that does not sum is rejected
before any money moves.

### v2 — the bounded delegate

The user calls `approve` on their token accounts naming the Reserve PDA as delegate with a
cap. `rebalance()` may then run unattended, and the instruction permits a swap **only** when
all of these hold:

- both mints are on the whitelist
- the trade moves actual weight **toward** the signed target
- executed price is inside a band around the Pyth price
- the destination is the owner's own token account, never a third party

Anything else fails the instruction. This is Sage's mandate pattern: the policy proposes,
the program disposes.

## The corporate-action watcher (build this first)

### What breaks

xStocks publishes a **multiplier** per asset before each ex-date, activated at 00:30 UTC the
day after, and balances rebase against it. Every xStock starts at 1.0. A dividend might move
it to 1.008; a 4-for-1 split multiplies it to roughly 4.032. Ondo does the equivalent on
Solana through Scaled UI.

If you read a raw token balance and compare it to yesterday's, a dividend looks like a
free gain and a split looks like a 300% return. Cost basis is wrong from that moment on,
and every number downstream — return, yield attribution, share of a payment — inherits the
error silently.

### What we do instead

Every position row stores:

| Field | Meaning |
| --- | --- |
| `qty_raw` | the token amount on chain right now |
| `multiplier_at_entry` | the issuer multiplier when this lot was acquired |
| `qty_adjusted` | `qty_raw / current_multiplier` — the stable economic unit |
| `cost_basis_base` | what was paid, in 6dp USD |

On a multiplier change the watcher writes a `multipliers` row, recomputes `qty_adjusted`
for every affected position, leaves `cost_basis_base` untouched (a dividend is not a
purchase), and publishes a **reconciliation receipt** naming the asset, the old and new
multiplier, the effective date and the resulting adjustment. Returns are computed from
`qty_adjusted × price − cost_basis`, which stays correct across every corporate action.

Tests to write before the feature is considered done:
- a 1.0 → 1.008 dividend does not register as a price gain
- a 4-for-1 split does not register as a 300% return
- a position acquired mid-cycle at multiplier 1.008 values correctly after a later split
- a missing or stale multiplier feed **holds** rather than guessing

## Off-chain services

### Allocator
Input: USDC amount + policy. For each leg, quote Jupiter, check the quote against Pyth,
refuse the leg if slippage exceeds the bound, and build the transaction bundle. Refusing is
always allowed; guessing never is.

### Valuer
Pyth 24/7 equity and metal feeds for NAV and time-weighted return. **Never price from pool
state** — thin weekend liquidity makes pool price a bad ruler, and the premium/discount to
the real underlying is exactly the error to avoid inheriting.

### Yield router (v2)
Eligible equity legs to Kamino lending; the gold leg to Oro staking. Track principal and
accrual separately so yield is never mistaken for price appreciation.

### Pay rail
Sender signs a transaction that converts (if needed) and transfers to the recipient's token
accounts. If the recipient has no reserve, generate a claim link that opens one on
acceptance. One receipt per payment naming what moved and to whom.

### Receipt writer
Every event becomes a row and a public page at `/receipt/<signature>`. A receipt that
cannot be opened is not a receipt.

## Data model

```
reserves        owner, pda, policy_json, opened_at
positions       reserve, mint, qty_raw, qty_adjusted, cost_basis_base, multiplier_at_entry
allocations     sig, reserve, legs_json, usdc_in_base, at
payments        sig, from_reserve, to_owner, legs_json, value_base, at
multipliers     mint, value, effective_at, source, seen_at
receipts        sig, kind, reserve, payload_json, at
sponsorships    sponsor, mint, amount_base, claimed_by, claimed_at
```

## Failure policy

Every service returns a value, never throws for control flow — carried over from Sage,
where it is the reason a failed judgment never corrupted a payout. A stale price, a missing
multiplier, a failed quote: all of these **hold and say why**. Nothing guesses with money.

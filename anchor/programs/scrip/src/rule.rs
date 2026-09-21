//! THE ARITHMETIC OF THE RULE — pure functions, no accounts, so every branch is a unit test.
//!
//! Two computations decide how much money moves and nothing else in the program does:
//!
//!   `compute_slice`  how much USDC leaves the owner's account for this inflow
//!   `min_out_raw`    the least of the asset that must arrive for the sweep to stand
//!
//! Both are mirrored in TypeScript (`src/lib/rule/`), and the TypeScript tests read THIS
//! file's constants so the two copies cannot drift without a test going red.

use crate::errors::ScripError;
use anchor_lang::prelude::*;

/// Half. A rule that takes everything is not a savings rate, it is a redirection.
pub const MAX_RATE_BPS: u16 = 5_000;
/// Every ninety days, if escalation is on.
pub const ESCALATION_PERIOD: i64 = 90 * 86_400;
/// $0.50 in 6-decimal USDC. Below this a swap's fees eat the slice.
pub const MIN_SLICE: u64 = 500_000;
/// $1. An inflow below this is not income, it is dust.
pub const DEFAULT_MIN_INBOUND: u64 = 1_000_000;
pub const MIN_TOLERANCE_BPS: u16 = 50;
pub const MAX_TOLERANCE_BPS: u16 = 300;
/// A price older than this may not move money. The sweep waits; nothing is lost by waiting.
pub const FEED_MAX_AGE: i64 = 600;
/// A confidence band wider than this is a feed under stress. 1%.
pub const MAX_CONF_BPS: u128 = 100;
pub const TOTAL_BPS: u128 = 10_000;
/// USDC has six decimals, so one dollar is a million.
pub const USDC_PER_DOLLAR: u128 = 1_000_000;

/// The rate in force at `now`: the base rate plus one escalation step per full period.
pub fn effective_rate(rate_bps: u16, escalate_bps: u16, enabled_unix: i64, now: i64) -> u16 {
    if escalate_bps == 0 || now <= enabled_unix {
        return rate_bps;
    }
    let periods = ((now - enabled_unix) / ESCALATION_PERIOD) as u64;
    let escalated = (rate_bps as u64).saturating_add((escalate_bps as u64).saturating_mul(periods));
    escalated.min(MAX_RATE_BPS as u64) as u16
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SliceInput {
    /// The owner's USDC balance right now.
    pub balance: u64,
    pub watermark: u64,
    pub min_inbound: u64,
    pub cap: u64,
    pub floor: u64,
    pub rate_bps: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Slice {
    /// bal − watermark, after the watermark is lowered if the balance fell (spending is not income).
    pub inbound: u64,
    pub taxable: u64,
    pub slice: u64,
}

/// How much of this inflow becomes the asset.
///
/// The rule sees the NET INCREASE of the account since the last sweep, never gross inbound.
/// If the balance fell, the watermark follows it down and nothing converts: spending is not
/// income. The cap bounds what one inflow can be taxed on; the floor bounds what the sweep
/// may leave behind. Everything above the slice stays the owner's, untaxed, forever.
pub fn compute_slice(i: SliceInput) -> Result<Slice> {
    let watermark = i.watermark.min(i.balance);
    let inbound = i.balance - watermark;
    require!(inbound >= i.min_inbound, ScripError::InboundBelowMinimum);

    let taxable = if i.cap > 0 { inbound.min(i.cap) } else { inbound };
    let mut slice = ((taxable as u128) * (i.rate_bps as u128) / TOTAL_BPS) as u64;
    if i.floor > 0 {
        slice = slice.min(i.balance.saturating_sub(i.floor));
    }
    require!(slice >= MIN_SLICE, ScripError::SliceBelowMinimum);
    Ok(Slice { inbound, taxable, slice })
}

/// The least raw units of the asset that must arrive for `slice_usdc`, given a Pyth price.
///
/// `price`, `conf` and `expo` are Pyth's own: the price is `price × 10^expo` dollars per unit.
/// The band is taken AGAINST the owner — price plus confidence — and then the tolerance the
/// owner chose is applied. Below the result, the whole sweep reverts.
///
/// `multiplier_e12` is `Some` when the feed prices a UI unit (one share-equivalent) and the
/// mint rebases: the min in UI units is divided by the live multiplier to reach raw units.
/// `None` when the feed prices the raw token, or the mint has no scaled-UI extension.
pub fn min_out_raw(
    slice_usdc: u64,
    tolerance_bps: u16,
    price: i64,
    conf: u64,
    expo: i32,
    asset_decimals: u8,
    multiplier_e12: Option<u128>,
) -> Result<u64> {
    require!(price > 0, ScripError::PriceInvalid);
    require!((-18..=0).contains(&expo), ScripError::PriceInvalid);
    require!(asset_decimals <= 18, ScripError::PriceInvalid);
    let p_hi = (price as u128).checked_add(conf as u128).ok_or(ScripError::Overflow)?;

    // min_units = slice_usd × (1 − tol) / p_hi, expressed in the mint's decimals.
    //   slice_usd = slice_usdc / 1e6
    //   p_hi      = (price + conf) × 10^expo
    // so min_raw  = slice_usdc × (10000 − tol) × 10^dec × 10^(−expo) / (1e6 × 10000 × (price + conf))
    let numerator = (slice_usdc as u128)
        .checked_mul(TOTAL_BPS - tolerance_bps as u128)
        .and_then(|n| n.checked_mul(10u128.pow(asset_decimals as u32)))
        .and_then(|n| n.checked_mul(10u128.pow((-expo) as u32)))
        .ok_or(ScripError::Overflow)?;
    let denominator = USDC_PER_DOLLAR
        .checked_mul(TOTAL_BPS)
        .and_then(|d| d.checked_mul(p_hi))
        .ok_or(ScripError::Overflow)?;
    let mut min = numerator / denominator;

    if let Some(mult) = multiplier_e12 {
        require!(mult > 0, ScripError::MultiplierInvalid);
        // The feed priced a UI unit; the token account counts raw units, and raw × mult = UI.
        min = min.checked_mul(1_000_000_000_000).ok_or(ScripError::Overflow)? / mult;
    }
    u64::try_from(min).map_err(|_| error!(ScripError::Overflow))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(balance: u64, watermark: u64) -> SliceInput {
        SliceInput { balance, watermark, min_inbound: DEFAULT_MIN_INBOUND, cap: 0, floor: 0, rate_bps: 1_000 }
    }

    #[test]
    fn ten_percent_of_a_five_hundred_dollar_arrival() {
        let s = compute_slice(input(500_000_000, 0)).unwrap();
        assert_eq!(s.inbound, 500_000_000);
        assert_eq!(s.slice, 50_000_000);
    }

    #[test]
    fn only_the_net_increase_since_the_watermark_is_income() {
        // $1,000 was already seen. $200 more arrived.
        let s = compute_slice(input(1_200_000_000, 1_000_000_000)).unwrap();
        assert_eq!(s.inbound, 200_000_000);
        assert_eq!(s.slice, 20_000_000);
    }

    #[test]
    fn spending_is_not_income() {
        // $1,000 was seen. The owner spent $700. The balance is below the watermark, so the
        // watermark follows it down and NOTHING is income.
        let err = compute_slice(input(300_000_000, 1_000_000_000)).unwrap_err();
        assert_eq!(err, ScripError::InboundBelowMinimum.into());
        // Then $50 arrives on top of the $300 the watermark now sits at: only the $50 is new.
        let s = compute_slice(input(350_000_000, 300_000_000)).unwrap();
        assert_eq!(s.inbound, 50_000_000);
        assert_eq!(s.slice, 5_000_000);
    }

    #[test]
    fn a_spend_and_an_arrival_between_two_sweeps_nets_out() {
        // $1,000 seen. $500 arrives and $500 leaves before a keeper acts: the balance is back
        // at the watermark, and nothing converts. Said plainly in the interface.
        let err = compute_slice(input(1_000_000_000, 1_000_000_000)).unwrap_err();
        assert_eq!(err, ScripError::InboundBelowMinimum.into());
    }

    #[test]
    fn an_inflow_below_the_minimum_is_ignored() {
        let err = compute_slice(input(900_000, 0)).unwrap_err();
        assert_eq!(err, ScripError::InboundBelowMinimum.into());
    }

    #[test]
    fn a_slice_below_fifty_cents_is_refused() {
        // $4 at 10% is $0.40.
        let err = compute_slice(input(4_000_000, 0)).unwrap_err();
        assert_eq!(err, ScripError::SliceBelowMinimum.into());
        // $5 at 10% is exactly $0.50, which is allowed.
        assert_eq!(compute_slice(input(5_000_000, 0)).unwrap().slice, MIN_SLICE);
    }

    #[test]
    fn the_cap_bounds_what_one_inflow_is_taxed_on() {
        let mut i = input(20_000_000_000, 0); // $20,000 treasury move
        i.cap = 5_000_000_000; // $5,000
        let s = compute_slice(i).unwrap();
        assert_eq!(s.taxable, 5_000_000_000);
        assert_eq!(s.slice, 500_000_000); // $500, not $2,000
    }

    #[test]
    fn the_floor_keeps_cash_the_owner_needs() {
        let mut i = input(120_000_000, 0); // $120 arrived
        i.floor = 110_000_000; // keep $110
        let s = compute_slice(i).unwrap();
        // 10% would be $12, but that leaves $108. Only $10 may go.
        assert_eq!(s.slice, 10_000_000);
    }

    #[test]
    fn a_floor_above_the_balance_leaves_nothing_to_sweep() {
        let mut i = input(100_000_000, 0);
        i.floor = 200_000_000;
        assert_eq!(compute_slice(i).unwrap_err(), ScripError::SliceBelowMinimum.into());
    }

    #[test]
    fn escalation_adds_a_step_per_full_period_and_stops_at_the_ceiling() {
        let t0 = 1_700_000_000;
        assert_eq!(effective_rate(1_000, 100, t0, t0), 1_000);
        assert_eq!(effective_rate(1_000, 100, t0, t0 + ESCALATION_PERIOD - 1), 1_000);
        assert_eq!(effective_rate(1_000, 100, t0, t0 + ESCALATION_PERIOD), 1_100);
        assert_eq!(effective_rate(1_000, 100, t0, t0 + 4 * ESCALATION_PERIOD), 1_400);
        assert_eq!(effective_rate(4_950, 100, t0, t0 + 10 * ESCALATION_PERIOD), MAX_RATE_BPS);
        assert_eq!(effective_rate(1_000, 0, t0, t0 + 100 * ESCALATION_PERIOD), 1_000);
    }

    /// The SPYX/USD print read off mainnet on 2026-09-15: $769.91, conf $0.21, expo −8.
    const SPYX_PRICE: i64 = 76_991_499_999;
    const SPYX_CONF: u64 = 20_800_595;

    #[test]
    fn min_out_for_fifty_dollars_of_spyx_at_one_percent_tolerance() {
        let min = min_out_raw(50_000_000, 100, SPYX_PRICE, SPYX_CONF, -8, 8, None).unwrap();
        // $50 / $770.123 (price + conf) = 0.0649247 SPYx; × 0.99 = 0.0642754. 8 decimals,
        // truncated: 50e6 × 9900 × 1e8 × 1e8 / (1e6 × 1e4 × 77_012_300_594).
        assert_eq!(min, 6_427_544);
    }

    #[test]
    fn a_wider_tolerance_asks_for_less() {
        let tight = min_out_raw(50_000_000, 50, SPYX_PRICE, SPYX_CONF, -8, 8, None).unwrap();
        let loose = min_out_raw(50_000_000, 300, SPYX_PRICE, SPYX_CONF, -8, 8, None).unwrap();
        assert!(loose < tight);
    }

    #[test]
    fn the_confidence_band_is_taken_against_the_owner() {
        let no_conf = min_out_raw(50_000_000, 100, SPYX_PRICE, 0, -8, 8, None).unwrap();
        let with_conf = min_out_raw(50_000_000, 100, SPYX_PRICE, SPYX_CONF, -8, 8, None).unwrap();
        assert!(with_conf < no_conf, "a wider band must demand fewer units, never more");
    }

    #[test]
    fn a_ui_priced_feed_converts_through_the_live_multiplier() {
        // The SPY equity feed prices one share. The mint rebases at 1.005714560286254, so one
        // raw token is worth 1.0057 shares and FEWER raw units satisfy the same dollar value.
        let per_share = 76_555_000_000i64; // $765.55 per share
        let raw_basis = min_out_raw(50_000_000, 100, per_share, 0, -8, 8, None).unwrap();
        let mult_e12 = 1_005_714_560_286u128; // 1.005714560286 × 1e12
        let adjusted = min_out_raw(50_000_000, 100, per_share, 0, -8, 8, Some(mult_e12)).unwrap();
        assert!(adjusted < raw_basis);
        // raw_basis / 1.0057 ≈ adjusted, within a unit of rounding.
        let expected = (raw_basis as u128) * 1_000_000_000_000 / mult_e12;
        assert!((adjusted as i128 - expected as i128).abs() <= 1);
    }

    #[test]
    fn a_multiplier_of_one_changes_nothing() {
        let a = min_out_raw(50_000_000, 100, SPYX_PRICE, SPYX_CONF, -8, 8, None).unwrap();
        let b = min_out_raw(50_000_000, 100, SPYX_PRICE, SPYX_CONF, -8, 8, Some(1_000_000_000_000)).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn a_six_decimal_asset_at_a_metal_price() {
        // GOLD: one token is one troy ounce at ~$4,365, six decimals, XAU feed expo −8.
        let min = min_out_raw(50_000_000, 100, 436_500_000_000, 100_000_000, -8, 6, None).unwrap();
        // $50 / $4,366 = 0.011452 oz × 0.99 = 0.011337 → 11_337 at 6 dp.
        assert!(min > 11_000 && min < 11_500, "{min}");
    }

    #[test]
    fn a_five_thousand_dollar_slice_does_not_overflow() {
        // The cap's default. u128 headroom is asserted, not assumed.
        let min = min_out_raw(5_000_000_000, 50, SPYX_PRICE, SPYX_CONF, -8, 8, Some(1_005_714_560_286)).unwrap();
        assert!(min > 0);
    }

    #[test]
    fn a_non_positive_price_or_wild_exponent_is_refused() {
        assert!(min_out_raw(50_000_000, 100, 0, 0, -8, 8, None).is_err());
        assert!(min_out_raw(50_000_000, 100, -5, 0, -8, 8, None).is_err());
        assert!(min_out_raw(50_000_000, 100, SPYX_PRICE, 0, 3, 8, None).is_err());
        assert!(min_out_raw(50_000_000, 100, SPYX_PRICE, 0, -8, 8, Some(0)).is_err());
    }
}

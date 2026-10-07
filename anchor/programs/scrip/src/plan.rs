//! THE MATCH — the arithmetic of a sponsor's Plan, pure, so it is tested without a chain.
//!
//! A Plan adds a share of every automatic save a member makes, in the Plan's stock, from an
//! escrow the sponsor funded. Three limits, and the smallest wins:
//!
//!   the share     the saved slice × `match_bps` / 10,000
//!   the month     what is left of the member's monthly cap, in USDC, over 30-day periods
//!   the escrow    what the escrow actually holds; a short escrow pays what it has, and the
//!                 dollars counted against the month are pro rata, never more
//!
//! The dollars become stock at Pyth's price PLUS its confidence band (`min_out_raw` with no
//! tolerance), so the sponsor never pays more stock than the dollars are worth.

/// A match period: thirty days from the member's joining, rolled forward whole periods.
pub const MATCH_PERIOD: i64 = 30 * 86_400;
/// A match may add up to the whole slice again, never more.
pub const MAX_MATCH_BPS: u16 = 10_000;

/// The member's period after rolling it forward to `now`: the start of the current period and
/// what was matched in it. A period that has ended starts the count again at zero.
pub fn roll_period(period_start: i64, matched_this_period: u64, now: i64) -> (i64, u64) {
    if now < period_start.saturating_add(MATCH_PERIOD) {
        return (period_start, matched_this_period);
    }
    let periods = (now - period_start) / MATCH_PERIOD;
    (period_start + periods * MATCH_PERIOD, 0)
}

/// The dollars a saved slice earns: its share, capped by what the month still allows.
pub fn match_usdc(slice_usdc: u64, match_bps: u16, monthly_cap_usdc: u64, matched_this_period: u64) -> u64 {
    let want = ((slice_usdc as u128) * (match_bps.min(MAX_MATCH_BPS) as u128) / 10_000u128) as u64;
    let room = monthly_cap_usdc.saturating_sub(matched_this_period);
    want.min(room)
}

/// A short escrow pays what it holds, and the dollars counted are pro rata to what was paid.
pub fn limit_by_escrow(units_wanted: u64, usdc_wanted: u64, escrow: u64) -> (u64, u64) {
    if units_wanted <= escrow {
        return (units_wanted, usdc_wanted);
    }
    let usdc = ((usdc_wanted as u128) * (escrow as u128) / (units_wanted.max(1) as u128)) as u64;
    (escrow, usdc)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fifty_percent_match_on_a_ten_dollar_save_is_five_dollars() {
        assert_eq!(match_usdc(10_000_000, 5_000, 100_000_000, 0), 5_000_000);
    }

    #[test]
    fn the_monthly_cap_limits_the_match() {
        // $10 cap, $8 already matched: a $5 match becomes $2.
        assert_eq!(match_usdc(10_000_000, 5_000, 10_000_000, 8_000_000), 2_000_000);
        // Cap reached: nothing.
        assert_eq!(match_usdc(10_000_000, 5_000, 10_000_000, 10_000_000), 0);
        // Over the cap already (cannot happen, but never underflows): nothing.
        assert_eq!(match_usdc(10_000_000, 5_000, 10_000_000, 12_000_000), 0);
    }

    #[test]
    fn the_share_never_exceeds_the_slice() {
        assert_eq!(match_usdc(10_000_000, 20_000, u64::MAX, 0), 10_000_000);
    }

    #[test]
    fn a_period_rolls_forward_whole_periods_and_resets_the_count() {
        let start = 1_000_000;
        assert_eq!(roll_period(start, 7, start + MATCH_PERIOD - 1), (start, 7));
        assert_eq!(roll_period(start, 7, start + MATCH_PERIOD), (start + MATCH_PERIOD, 0));
        assert_eq!(roll_period(start, 7, start + 3 * MATCH_PERIOD + 5), (start + 3 * MATCH_PERIOD, 0));
    }

    #[test]
    fn a_short_escrow_pays_what_it_has_and_counts_dollars_pro_rata() {
        assert_eq!(limit_by_escrow(1_000, 5_000_000, 5_000), (1_000, 5_000_000));
        assert_eq!(limit_by_escrow(1_000, 5_000_000, 250), (250, 1_250_000));
        assert_eq!(limit_by_escrow(1_000, 5_000_000, 0), (0, 0));
    }
}

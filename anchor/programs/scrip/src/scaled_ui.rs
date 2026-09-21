//! THE LIVE MULTIPLIER, READ OFF THE MINT — and it is not the field called `multiplier`.
//!
//! A Token-2022 ScaledUiAmount config carries two values and a timestamp. The value in
//! `multiplier` is the OLDER one; `new_multiplier` takes over at its effective timestamp,
//! which on SPYx (read 2026-09-12) was three months in the past. An app that reads the
//! obvious field paints every balance 0.18% short, forever, with nothing looking wrong.
//!
//! Parsed by hand: the spl-token-2022 crate this anchor pins (v6) predates the extension.
//! The TLV walk is the token program's own: after the 82-byte mint, 83 bytes of padding and
//! one account-type byte, entries of `u16 type · u16 length · data`.

use crate::errors::ScripError;
use anchor_lang::prelude::*;

/// 82 (Mint) + 83 (padding to the Account size) + 1 (account type) = 166.
pub const MINT_TLV_START: usize = 166;
/// `ExtensionType::ScaledUiAmountConfig`, from the token program's enum.
pub const EXT_SCALED_UI_AMOUNT: u16 = 25;
/// `ExtensionType::PausableConfig`.
pub const EXT_PAUSABLE: u16 = 26;
/// authority (32) · multiplier f64 (8) · new_multiplier_effective_timestamp i64 (8) · new_multiplier f64 (8)
pub const SCALED_UI_LEN: usize = 56;

/// Nothing real is outside [1/50, 50]: a 4-for-1 split is 4, a reverse 1-for-10 is 0.1, a
/// reinvested dividend is a fraction of a percent. Outside it is a corrupt read, and a
/// corrupt read must not size a sweep.
pub const SANITY_MIN: f64 = 0.02;
pub const SANITY_MAX: f64 = 50.0;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScaledUi {
    pub multiplier: f64,
    pub new_multiplier: f64,
    pub effective_at: i64,
}

/// Find the extension's bytes, if the mint carries it. A classic mint, or a Token-2022 mint
/// without the extension, returns `None` — a multiplier of exactly one.
pub fn read_scaled_ui(mint_data: &[u8]) -> Option<ScaledUi> {
    let raw = find_extension(mint_data, EXT_SCALED_UI_AMOUNT)?;
    if raw.len() < SCALED_UI_LEN {
        return None;
    }
    Some(ScaledUi {
        multiplier: f64::from_le_bytes(raw[32..40].try_into().ok()?),
        effective_at: i64::from_le_bytes(raw[40..48].try_into().ok()?),
        new_multiplier: f64::from_le_bytes(raw[48..56].try_into().ok()?),
    })
}

/// True when the mint carries a PausableConfig whose `paused` flag is set.
pub fn is_paused(mint_data: &[u8]) -> bool {
    match find_extension(mint_data, EXT_PAUSABLE) {
        Some(raw) if raw.len() >= 33 => raw[32] != 0,
        _ => false,
    }
}

fn find_extension(mint_data: &[u8], wanted: u16) -> Option<&[u8]> {
    if mint_data.len() <= MINT_TLV_START {
        return None;
    }
    let mut o = MINT_TLV_START;
    while o + 4 <= mint_data.len() {
        let t = u16::from_le_bytes([mint_data[o], mint_data[o + 1]]);
        let len = u16::from_le_bytes([mint_data[o + 2], mint_data[o + 3]]) as usize;
        if t == 0 {
            return None; // Uninitialized: the end of the list.
        }
        let start = o + 4;
        let end = start.checked_add(len)?;
        if end > mint_data.len() {
            return None;
        }
        if t == wanted {
            return Some(&mint_data[start..end]);
        }
        o = end;
    }
    None
}

/// The multiplier in force at `now`, as a fixed-point integer scaled by 1e12.
///
/// THE TIMESTAMP ON THE MINT DECIDES. Nothing here hardcodes an activation hour: the one
/// activation observed on chain was 04:00 UTC, not the 00:30 the issuer's docs describe.
pub fn live_multiplier_e12(cfg: &ScaledUi, now: i64) -> Result<u128> {
    let live = if now >= cfg.effective_at { cfg.new_multiplier } else { cfg.multiplier };
    require!(live.is_finite() && live >= SANITY_MIN && live <= SANITY_MAX, ScripError::MultiplierInvalid);
    Ok((live * 1e12 + 0.5) as u128)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mint_with(entries: &[(u16, &[u8])]) -> Vec<u8> {
        let mut d = vec![0u8; MINT_TLV_START];
        d[MINT_TLV_START - 1] = 1; // AccountType::Mint
        for (t, data) in entries {
            d.extend_from_slice(&t.to_le_bytes());
            d.extend_from_slice(&(data.len() as u16).to_le_bytes());
            d.extend_from_slice(data);
        }
        d
    }

    fn scaled(m: f64, new: f64, at: i64) -> [u8; SCALED_UI_LEN] {
        let mut b = [0u8; SCALED_UI_LEN];
        b[32..40].copy_from_slice(&m.to_le_bytes());
        b[40..48].copy_from_slice(&at.to_le_bytes());
        b[48..56].copy_from_slice(&new.to_le_bytes());
        b
    }

    /// The SPYx mint as read on 2026-09-12.
    const OLD: f64 = 1.003909240011759;
    const NEW: f64 = 1.005714560286254;
    const EFFECTIVE: i64 = 1_781_755_200;

    #[test]
    fn finds_the_extension_behind_others() {
        let d = mint_with(&[(12, &[0u8; 32]), (EXT_PAUSABLE, &[0u8; 33]), (EXT_SCALED_UI_AMOUNT, &scaled(OLD, NEW, EFFECTIVE))]);
        let cfg = read_scaled_ui(&d).unwrap();
        assert_eq!(cfg.multiplier, OLD);
        assert_eq!(cfg.new_multiplier, NEW);
        assert_eq!(cfg.effective_at, EFFECTIVE);
    }

    #[test]
    fn a_plain_mint_has_no_multiplier() {
        assert!(read_scaled_ui(&[0u8; 82]).is_none());
        assert!(read_scaled_ui(&mint_with(&[])).is_none());
        assert!(read_scaled_ui(&mint_with(&[(12, &[0u8; 32])])).is_none());
    }

    #[test]
    fn the_live_value_is_the_new_one_once_its_timestamp_has_passed() {
        let cfg = ScaledUi { multiplier: OLD, new_multiplier: NEW, effective_at: EFFECTIVE };
        assert_eq!(live_multiplier_e12(&cfg, EFFECTIVE - 1).unwrap(), 1_003_909_240_012);
        assert_eq!(live_multiplier_e12(&cfg, EFFECTIVE).unwrap(), 1_005_714_560_286);
        assert_eq!(live_multiplier_e12(&cfg, EFFECTIVE + 90 * 86_400).unwrap(), 1_005_714_560_286);
    }

    #[test]
    fn the_obvious_field_is_zero_point_one_eight_percent_short() {
        // The finding that makes this module exist, held as a number.
        let cfg = ScaledUi { multiplier: OLD, new_multiplier: NEW, effective_at: EFFECTIVE };
        let live = live_multiplier_e12(&cfg, EFFECTIVE + 1).unwrap();
        let stale = (OLD * 1e12 + 0.5) as u128;
        let short_bps = (live - stale) * 10_000 / live;
        assert_eq!(short_bps, 17); // 0.17%..0.18%
    }

    #[test]
    fn a_corrupt_multiplier_holds() {
        for bad in [0.0, -1.0, 0.001, 100.0, f64::NAN, f64::INFINITY] {
            let cfg = ScaledUi { multiplier: bad, new_multiplier: bad, effective_at: 0 };
            assert!(live_multiplier_e12(&cfg, 1).is_err(), "{bad}");
        }
    }

    #[test]
    fn a_paused_mint_is_detected() {
        let mut p = [0u8; 33];
        assert!(!is_paused(&mint_with(&[(EXT_PAUSABLE, &p)])));
        p[32] = 1;
        assert!(is_paused(&mint_with(&[(EXT_PAUSABLE, &p)])));
        assert!(!is_paused(&mint_with(&[])));
    }

    #[test]
    fn a_truncated_entry_does_not_read_past_the_end() {
        let mut d = mint_with(&[]);
        d.extend_from_slice(&EXT_SCALED_UI_AMOUNT.to_le_bytes());
        d.extend_from_slice(&(SCALED_UI_LEN as u16).to_le_bytes());
        d.extend_from_slice(&[0u8; 10]);
        assert!(read_scaled_ui(&d).is_none());
    }
}

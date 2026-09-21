//! READING A PYTH PRICE OFF THE CHAIN — the receiver's `PriceUpdateV2` account, by offset.
//!
//! Offsets rather than the receiver SDK: the layout is fixed, this is six reads, and a
//! dependency in the path of every sweep is a dependency that can stop every sweep. The same
//! offsets are used by `src/lib/pyth/price.ts`, and both were checked against the SPYX/USD
//! sponsored account on mainnet.
//!
//!   0    8   anchor discriminator — sha256("account:PriceUpdateV2")[..8]
//!   8   32   write_authority
//!   40   1   verification level: 0 = Partial (followed by one byte), 1 = Full
//!   41  32   feed_id
//!   73   8   price   (i64)
//!   81   8   conf    (u64)
//!   89   4   exponent (i32)
//!   93   8   publish_time (i64)
//!   ...      prev_publish_time, ema_price, ema_conf, posted_slot

use crate::errors::ScripError;
use anchor_lang::prelude::*;

/// The Pyth receiver program. The same id on mainnet and devnet.
pub const PYTH_RECEIVER: Pubkey = Pubkey::from_str_const("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

/// Read off the SPYX/USD account on mainnet, 2026-09-15; equals sha256("account:PriceUpdateV2")[..8].
pub const PRICE_UPDATE_V2_DISCRIMINATOR: [u8; 8] = [34, 241, 35, 99, 157, 126, 244, 205];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PythPrice {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
}

/// Parse a PriceUpdateV2. Refuses a partial verification: a fully verified update carries
/// the guardian quorum, and money does not move on less.
pub fn parse_price_update(data: &[u8]) -> Result<PythPrice> {
    require!(data.len() >= 101, ScripError::PriceInvalid);
    require!(data[..8] == PRICE_UPDATE_V2_DISCRIMINATOR, ScripError::PriceInvalid);
    require!(data[40] == 1, ScripError::PriceNotFullyVerified);
    let base = 41usize;
    let mut feed_id = [0u8; 32];
    feed_id.copy_from_slice(&data[base..base + 32]);
    let price = i64::from_le_bytes(data[base + 32..base + 40].try_into().unwrap());
    let conf = u64::from_le_bytes(data[base + 40..base + 48].try_into().unwrap());
    let expo = i32::from_le_bytes(data[base + 48..base + 52].try_into().unwrap());
    let publish_time = i64::from_le_bytes(data[base + 52..base + 60].try_into().unwrap());
    require!(price > 0, ScripError::PriceInvalid);
    Ok(PythPrice { feed_id, price, conf, expo, publish_time })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(level: u8, price: i64, conf: u64, expo: i32, publish: i64) -> Vec<u8> {
        let mut d = vec![0u8; 134];
        d[..8].copy_from_slice(&PRICE_UPDATE_V2_DISCRIMINATOR);
        d[40] = level;
        d[41..73].copy_from_slice(&[7u8; 32]);
        d[73..81].copy_from_slice(&price.to_le_bytes());
        d[81..89].copy_from_slice(&conf.to_le_bytes());
        d[89..93].copy_from_slice(&expo.to_le_bytes());
        d[93..101].copy_from_slice(&publish.to_le_bytes());
        d
    }

    #[test]
    fn reads_every_field_at_its_offset() {
        let p = parse_price_update(&fixture(1, 76_991_499_999, 20_800_595, -8, 1_789_000_000)).unwrap();
        assert_eq!(p.feed_id, [7u8; 32]);
        assert_eq!(p.price, 76_991_499_999);
        assert_eq!(p.conf, 20_800_595);
        assert_eq!(p.expo, -8);
        assert_eq!(p.publish_time, 1_789_000_000);
    }

    #[test]
    fn a_partial_verification_is_refused() {
        assert_eq!(
            parse_price_update(&fixture(0, 1, 0, -8, 1)).unwrap_err(),
            ScripError::PriceNotFullyVerified.into()
        );
    }

    #[test]
    fn the_wrong_discriminator_is_not_a_price() {
        let mut d = fixture(1, 1, 0, -8, 1);
        d[0] ^= 1;
        assert!(parse_price_update(&d).is_err());
    }

    #[test]
    fn a_short_account_is_not_a_price() {
        assert!(parse_price_update(&[0u8; 50]).is_err());
    }

    #[test]
    fn the_discriminator_is_the_anchor_hash_of_the_account_name() {
        use anchor_lang::solana_program::hash::hash;
        let h = hash(b"account:PriceUpdateV2");
        assert_eq!(&h.to_bytes()[..8], &PRICE_UPDATE_V2_DISCRIMINATOR);
    }
}

//! WHAT A RULE MAY BUY — compiled in, read off mainnet, with the Pyth feed that prices it.
//!
//! Every mint and feed id here was read from a chain account or a Pyth API response on the
//! date noted, never typed from memory: a mint address typed from memory is not a typo, it is
//! a transfer to a stranger. `src/lib/assets/registry.ts` carries the same table with the
//! human facts (issuer, decimals, disclosure), and a TypeScript test reads this file so the
//! two cannot drift.
//!
//! TWO FEEDS PER ASSET, and the difference is the whole corporate-action problem:
//!
//!   feed_raw       prices one RAW token as it trades (Pyth `Crypto.SPYX/USD`). It already
//!                  carries the issuer's multiplier, and it is pushed around the clock.
//!   feed_adjusted  prices one UI unit — one share (Pyth `Equity.US.SPY/USD`). The token
//!                  account counts raw units, so the min-out must divide by the live
//!                  multiplier. Pushed in market hours.
//!
//! `finish_sweep` accepts either, decides which it was given by the feed id on the account,
//! and applies the multiplier only for the adjusted one.

use anchor_lang::prelude::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Entry {
    pub mint: Pubkey,
    pub feed_raw: [u8; 32],
    pub feed_adjusted: [u8; 32],
    /// True for every Backed / xStocks mint: needs the eligibility attestation.
    pub xstocks: bool,
}

pub const ZERO_FEED: [u8; 32] = [0u8; 32];

/// Circle's USDC on mainnet. The only pay-in mint the mainnet build accepts.
pub const USDC_MINT: Pubkey = Pubkey::from_str_const("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// ── Pyth feed ids, hex, as published by Hermes ───────────────────────────────────────────
pub const FEED_SPYX_USD: [u8; 32] = hex32("2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14");
pub const FEED_SPY_USD: [u8; 32] = hex32("19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5");
pub const FEED_XAU_USD: [u8; 32] = hex32("765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2");
pub const FEED_USDC_USD: [u8; 32] = hex32("eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a");
pub const FEED_SOL_USD: [u8; 32] = hex32("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d");

// ── the xStocks token feeds (Crypto.<TICKER>X/USD) and the underlying equity feeds ─────────
// Feed ids from Hermes `/v2/price_feeds`, 2026-09-15.
pub const FEED_QQQX_USD: [u8; 32] = hex32("178a6f73a5aede9d0d682e86b0047c9f333ed0efe5c6537ca937565219c4054d");
pub const FEED_QQQ_USD: [u8; 32] = hex32("9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d");
pub const FEED_NVDAX_USD: [u8; 32] = hex32("4244d07890e4610f46bbde67de8f43a4bf8b569eebe904f136b469f148503b7f");
pub const FEED_NVDA_USD: [u8; 32] = hex32("b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593");
pub const FEED_TSLAX_USD: [u8; 32] = hex32("47a156470288850a440df3a6ce85a55917b813a19bb5b31128a33a986566a362");
pub const FEED_TSLA_USD: [u8; 32] = hex32("16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1");
pub const FEED_AAPLX_USD: [u8; 32] = hex32("978e6cc68a119ce066aa830017318563a9ed04ec3a0a6439010fc11296a58675");
pub const FEED_AAPL_USD: [u8; 32] = hex32("49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688");
pub const FEED_GOOGLX_USD: [u8; 32] = hex32("b911b0329028cd0283e4259c33809d62942bd2716a58084e5f31d64c00b5424e");
pub const FEED_GOOGL_USD: [u8; 32] = hex32("5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6");
pub const FEED_AMZNX_USD: [u8; 32] = hex32("7148fbe6e493ff2580305c92a8d7f8628c9943b11b9b253aebc24863fec290e8");
pub const FEED_AMZN_USD: [u8; 32] = hex32("b5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a");
pub const FEED_METAX_USD: [u8; 32] = hex32("bf3e5871be3f80ab7a4d1f1fd039145179fb58569e159aee1ccd472868ea5900");
pub const FEED_META_USD: [u8; 32] = hex32("78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe");
pub const FEED_MSTRX_USD: [u8; 32] = hex32("53f95ba4e23ed15ea56083e2ee9a5eec48055d6f59033d4bb95f1ca2a2349c28");
pub const FEED_MSTR_USD: [u8; 32] = hex32("e1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09");
pub const FEED_COINX_USD: [u8; 32] = hex32("641435d5dffb5311140b480517c79986d8488d5cf08a11eec53b83ad02cab33f");
pub const FEED_COIN_USD: [u8; 32] = hex32("fee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245");
pub const FEED_CRCLX_USD: [u8; 32] = hex32("c13184461c0c80d98ffcd89be627c2220b94a96c7c67f0c4b16bc12fd3b17758");
pub const FEED_CRCL_USD: [u8; 32] = hex32("92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365");
pub const FEED_HOODX_USD: [u8; 32] = hex32("dd49a9ac6df5cbfa9d8fc6371f7ae927a74d5c6763c1c01b4220d70314c647f9");
pub const FEED_HOOD_USD: [u8; 32] = hex32("306736a4035846ba15a3496eed57225b64cc19230a50d14f3ed20fd7219b7849");
pub const FEED_MSFTX_USD: [u8; 32] = hex32("bb723a70af731ab56b9a650eb7e8ac22b7bc07ea77f8670bd1fa9a37bf6df3f5");
pub const FEED_MSFT_USD: [u8; 32] = hex32("d0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1");

// ── mints, read off mainnet 2026-09-12 (SPYx, GOLD) and 2026-09-15 (the rest) ─────────────
// Every xStocks mint below was read to carry the same extensions: PermanentDelegate,
// PausableConfig, ScaledUiAmountConfig, a TransferHook set to the system program (disabled),
// ConfidentialTransferMint (disabled), and a freeze authority. Oro GOLD is a plain SPL mint
// with no freeze authority and no extensions.
pub const MINT_SPYX: Pubkey = Pubkey::from_str_const("XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W");
pub const MINT_QQQX: Pubkey = Pubkey::from_str_const("Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ");
pub const MINT_GOLD: Pubkey = Pubkey::from_str_const("GoLDppdjB1vDTPSGxyMJFqdnj134yH6Prg9eqsGDiw6A");
pub const MINT_NVDAX: Pubkey = Pubkey::from_str_const("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
pub const MINT_TSLAX: Pubkey = Pubkey::from_str_const("XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB");
pub const MINT_AAPLX: Pubkey = Pubkey::from_str_const("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");
pub const MINT_GOOGLX: Pubkey = Pubkey::from_str_const("XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN");
pub const MINT_AMZNX: Pubkey = Pubkey::from_str_const("Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg");
pub const MINT_METAX: Pubkey = Pubkey::from_str_const("Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu");
pub const MINT_MSTRX: Pubkey = Pubkey::from_str_const("XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ");
pub const MINT_COINX: Pubkey = Pubkey::from_str_const("Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu");
pub const MINT_CRCLX: Pubkey = Pubkey::from_str_const("XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1");
pub const MINT_HOODX: Pubkey = Pubkey::from_str_const("XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg");
pub const MINT_MSFTX: Pubkey = Pubkey::from_str_const("XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX");

/// The mainnet table. The two index trackers, the metal, and the eleven deepest single-name
/// xStocks by Jupiter liquidity and 24-hour volume on 2026-09-15 (CRCLx $2.3M/$11.2M down
/// to HOODx $0.5M/$1.4M).
#[cfg(not(feature = "devnet"))]
pub const REGISTRY: &[Entry] = &[
    Entry { mint: MINT_SPYX, feed_raw: FEED_SPYX_USD, feed_adjusted: FEED_SPY_USD, xstocks: true },
    Entry { mint: MINT_QQQX, feed_raw: FEED_QQQX_USD, feed_adjusted: FEED_QQQ_USD, xstocks: true },
    // One token is one troy ounce and the mint does not rebase, so the raw feed is the metal
    // feed and there is no adjusted one.
    Entry { mint: MINT_GOLD, feed_raw: FEED_XAU_USD, feed_adjusted: ZERO_FEED, xstocks: false },
    Entry { mint: MINT_CRCLX, feed_raw: FEED_CRCLX_USD, feed_adjusted: FEED_CRCL_USD, xstocks: true },
    Entry { mint: MINT_NVDAX, feed_raw: FEED_NVDAX_USD, feed_adjusted: FEED_NVDA_USD, xstocks: true },
    Entry { mint: MINT_MSFTX, feed_raw: FEED_MSFTX_USD, feed_adjusted: FEED_MSFT_USD, xstocks: true },
    Entry { mint: MINT_GOOGLX, feed_raw: FEED_GOOGLX_USD, feed_adjusted: FEED_GOOGL_USD, xstocks: true },
    Entry { mint: MINT_TSLAX, feed_raw: FEED_TSLAX_USD, feed_adjusted: FEED_TSLA_USD, xstocks: true },
    Entry { mint: MINT_METAX, feed_raw: FEED_METAX_USD, feed_adjusted: FEED_META_USD, xstocks: true },
    Entry { mint: MINT_AAPLX, feed_raw: FEED_AAPLX_USD, feed_adjusted: FEED_AAPL_USD, xstocks: true },
    Entry { mint: MINT_AMZNX, feed_raw: FEED_AMZNX_USD, feed_adjusted: FEED_AMZN_USD, xstocks: true },
    Entry { mint: MINT_MSTRX, feed_raw: FEED_MSTRX_USD, feed_adjusted: FEED_MSTR_USD, xstocks: true },
    Entry { mint: MINT_COINX, feed_raw: FEED_COINX_USD, feed_adjusted: FEED_COIN_USD, xstocks: true },
    Entry { mint: MINT_HOODX, feed_raw: FEED_HOODX_USD, feed_adjusted: FEED_HOOD_USD, xstocks: true },
];

/// What `open_book` and `fund_payout` consult.
#[cfg(not(feature = "devnet"))]
pub fn lookup(mint: &Pubkey) -> Option<Entry> {
    REGISTRY.iter().copied().find(|e| &e.mint == mint)
}

/// Any pay-in mint but the real one is refused on mainnet.
#[cfg(not(feature = "devnet"))]
pub fn usdc_allowed(mint: &Pubkey) -> bool {
    mint == &USDC_MINT
}

/// THE DEVNET BUILD. Any mint is an asset, priced by the two feeds that ARE pushed on devnet:
/// SOL/USD as the raw feed and USDC/USD as the adjusted one, so a test mint with a scaled-UI
/// multiplier exercises the same conversion SPYx does on mainnet. Any six-decimal classic
/// mint may stand in for USDC.
#[cfg(feature = "devnet")]
pub fn lookup(mint: &Pubkey) -> Option<Entry> {
    Some(Entry { mint: *mint, feed_raw: FEED_SOL_USD, feed_adjusted: FEED_USDC_USD, xstocks: false })
}

#[cfg(feature = "devnet")]
pub fn usdc_allowed(_mint: &Pubkey) -> bool {
    true
}

const fn nib(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        b'A'..=b'F' => c - b'A' + 10,
        _ => panic!("not a hex digit"),
    }
}

/// A 64-character hex string to 32 bytes, at compile time.
pub const fn hex32(s: &str) -> [u8; 32] {
    let b = s.as_bytes();
    assert!(b.len() == 64, "a feed id is 64 hex characters");
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        out[i] = (nib(b[2 * i]) << 4) | nib(b[2 * i + 1]);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_round_trips() {
        let id = hex32("2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14");
        assert_eq!(id[0], 0x28);
        assert_eq!(id[1], 0x17);
        assert_eq!(id[31], 0x14);
    }

    #[cfg(not(feature = "devnet"))]
    #[test]
    fn the_mainnet_table_has_no_zero_mint_and_every_row_has_a_raw_feed() {
        for e in REGISTRY {
            assert_ne!(e.mint, Pubkey::default());
            assert_ne!(e.feed_raw, ZERO_FEED, "every asset needs a feed that is pushed around the clock");
        }
    }

    #[cfg(not(feature = "devnet"))]
    #[test]
    fn no_mint_and_no_feed_appears_twice() {
        // A duplicated mint would make `lookup` order-dependent; a duplicated feed would let
        // one asset's sweep be verified against another asset's price.
        for (i, a) in REGISTRY.iter().enumerate() {
            for b in REGISTRY.iter().skip(i + 1) {
                assert_ne!(a.mint, b.mint);
                assert_ne!(a.feed_raw, b.feed_raw);
                if a.feed_adjusted != ZERO_FEED {
                    assert_ne!(a.feed_adjusted, b.feed_adjusted);
                }
            }
            assert_ne!(a.feed_raw, a.feed_adjusted);
        }
    }

    #[cfg(not(feature = "devnet"))]
    #[test]
    fn every_xstock_has_an_equity_feed_to_check_against() {
        for e in REGISTRY.iter().filter(|e| e.xstocks) {
            assert_ne!(e.feed_adjusted, ZERO_FEED);
        }
    }

    #[cfg(not(feature = "devnet"))]
    #[test]
    fn spyx_needs_the_attestation_and_gold_does_not() {
        assert!(lookup(&MINT_SPYX).unwrap().xstocks);
        assert!(!lookup(&MINT_GOLD).unwrap().xstocks);
        assert!(lookup(&Pubkey::new_unique()).is_none());
        assert!(!usdc_allowed(&Pubkey::new_unique()));
        assert!(usdc_allowed(&USDC_MINT));
    }

    #[cfg(feature = "devnet")]
    #[test]
    fn the_devnet_build_accepts_any_mint_and_prices_it_by_sol_and_usdc() {
        let e = lookup(&Pubkey::new_unique()).unwrap();
        assert_eq!(e.feed_raw, FEED_SOL_USD);
        assert_eq!(e.feed_adjusted, FEED_USDC_USD);
    }
}

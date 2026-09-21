use anchor_lang::prelude::*;

/// A slug is a PDA seed and a URL segment. 3..=24 of `[a-z0-9]`, validated in `open_book`.
pub const MAX_SLUG_LEN: usize = 24;
pub const MIN_SLUG_LEN: usize = 3;

/// The rule and its watermark. Lives inline on the Book so there is exactly one copy.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug, PartialEq, Eq)]
pub struct Rule {
    pub enabled: bool,
    /// 1..=MAX_RATE_BPS. The share of a net inflow that becomes the asset.
    pub rate_bps: u16,
    /// Added to `rate_bps` every ESCALATION_PERIOD after `enabled_unix`. 0 = none.
    pub escalate_bps: u16,
    /// Never sweep below this much USDC. 0 = no floor.
    pub floor_usdc: u64,
    /// The most of one inflow that is taxable. 0 = no cap.
    pub cap_usdc: u64,
    /// An inflow smaller than this is ignored.
    pub min_inbound: u64,
    /// How far below the Pyth price (net of confidence) a fill may land. 50..=300.
    pub tolerance_bps: u16,
    /// The USDC balance the rule has already seen. Everything above it is new.
    pub watermark: u64,
    pub enabled_unix: i64,
    pub sweeps: u32,
}

/// The state between `begin_sweep` and `finish_sweep`, inside one transaction.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, InitSpace, Debug, PartialEq, Eq)]
pub struct Pending {
    pub release_id: [u8; 16],
    pub keeper: Pubkey,
    /// The net inflow that triggered this sweep — the receipt's basis.
    pub inbound: u64,
    /// The rate applied, after escalation.
    pub rate_bps: u16,
    pub slice: u64,
    /// The owner's USDC balance after the slice left. Must be unchanged at finish.
    pub usdc_before: u64,
    pub asset_before_raw: u64,
    /// Lamports the keeper advanced to create the owner's asset account, or 0.
    pub ata_rent: u64,
    pub slot: u64,
}

/// THE BOOK — one per owner, at `["book", owner]`. It is also the token delegate address.
///
/// It holds the rule, the watermark and a float of lamports above its own rent. It never
/// holds a token: the owner's USDC and the owner's asset both sit in the owner's own
/// associated token accounts, and the only power the Book has over them is the delegate
/// allowance the owner approved and can revoke at any time without asking this program.
#[account]
#[derive(InitSpace)]
pub struct Book {
    pub owner: Pubkey,
    #[max_len(MAX_SLUG_LEN)]
    pub slug: String,
    /// The one asset the rule buys.
    pub asset: Pubkey,
    /// The pay-in mint. Mainnet: USDC, always. Devnet: whatever the test opened with.
    pub usdc_mint: Pubkey,
    /// Pyth feed id that prices one RAW token of the asset (e.g. Crypto.SPYX/USD). Zero = none.
    pub feed_raw: [u8; 32],
    /// Pyth feed id that prices one UI unit — one share-equivalent — so the scaled-UI
    /// multiplier applies (e.g. Equity.US.SPY/USD). Zero = none.
    pub feed_adjusted: [u8; 32],
    /// Eligibility attestation. >= 1 is required for an xStocks asset.
    pub terms_version: u8,
    pub opened_unix: i64,
    pub bump: u8,
    pub rule: Rule,
    pub pending: Option<Pending>,
}

/// Who a handle names: a person with a rule, or an organisation that pays in stock.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace, Default)]
pub enum HandleKind {
    #[default]
    Person,
    Org,
}

/// `["handle", slug]` → owner. What `/@<slug>` and `/pay/<slug>` resolve through.
#[account]
#[derive(InitSpace)]
pub struct Handle {
    pub owner: Pubkey,
    pub bump: u8,
    pub kind: HandleKind,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PayoutKind {
    /// A named recipient with a Book. Released by the payer in the same transaction.
    Settle,
    /// Waits in escrow for an address with no Book, or for whoever holds a claim key.
    Sponsor,
}

/// THE ESCROW — the only thing the program ever holds, and only while it is under a rule.
///
/// A Payout exists exactly while it is open. Release, claim and cancel all close it, so
/// there is no state field to drift from the truth: the account's existence is the state.
#[account]
#[derive(InitSpace)]
pub struct Payout {
    pub payer: Pubkey,
    /// Settle: required. Sponsor: the address, or `Pubkey::default()` for "anyone with the key".
    pub recipient: Pubkey,
    /// Sponsor with no address: the claim key's pubkey. Otherwise default.
    pub claimant: Pubkey,
    pub kind: PayoutKind,
    pub release_id: [u8; 16],
    /// sha256 of the reason, which travels as an SPL Memo in the same transaction.
    pub reason_hash: [u8; 32],
    /// The exact-in USDC amount of the swap, in 6-decimal base units.
    pub declared_usdc: u64,
    pub asset: Pubkey,
    /// The least the escrow may hold at release, from the payer's own quote.
    pub min_out_raw: u64,
    pub created_unix: i64,
    /// The payroll run this payment belongs to, or zero. Copied onto the receipt.
    pub run_id: [u8; 16],
    pub bump: u8,
}

/// What a receipt records. A stock was swept under a rule, paid, given to an empty wallet,
/// granted on a schedule, or vested from a grant.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum ReceiptKind {
    Sweep,
    Pay,
    Gift,
    Grant,
    Vest,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace, Default)]
pub enum GrantState {
    #[default]
    Active,
    Completed,
    Revoked,
}

/// A GRANT — stock bought now that vests on a schedule, from anyone to anyone.
///
/// `["grant", payer, grant_id]`. The stock sits in the grant's own escrow token account,
/// which the recipient can see and the payer cannot spend. Vesting is computed on RAW
/// units, so a dividend reinvested through the multiplier while the stock waits goes to
/// whoever the units vest to. A revoked grant returns only what had not vested; what had
/// accrued by then stays claimable by `vest`.
#[account]
#[derive(InitSpace)]
pub struct Grant {
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub asset: Pubkey,
    pub grant_id: [u8; 16],
    /// Raw units in escrow at seal. Zero until sealed.
    pub total_raw: u64,
    pub released_raw: u64,
    /// After a revoke: the most that may ever be released (what had accrued). u64::MAX otherwise.
    pub release_cap_raw: u64,
    pub start_unix: i64,
    pub cliff_secs: u32,
    /// Linear after the cliff; 0 = everything at the cliff.
    pub duration_secs: u32,
    pub revocable: bool,
    pub sealed: bool,
    pub state: GrantState,
    pub reason_hash: [u8; 32],
    /// The exact-in USDC of the purchase, for the record.
    pub declared_usdc: u64,
    /// The least the escrow may hold at seal, from the payer's own quote.
    pub min_out_raw: u64,
    pub run_id: [u8; 16],
    pub created_unix: i64,
    pub vests: u32,
    pub bump: u8,
}

impl Grant {
    /// Raw units the schedule has released by `now`, before the cap and before subtracting
    /// what was already released. Whole at the cliff when there is no duration.
    pub fn scheduled_raw(&self, now: i64) -> u64 {
        let elapsed = now.saturating_sub(self.start_unix).saturating_sub(self.cliff_secs as i64);
        if elapsed < 0 {
            return 0;
        }
        if self.duration_secs == 0 {
            return self.total_raw;
        }
        let elapsed = (elapsed as u128).min(self.duration_secs as u128);
        ((self.total_raw as u128) * elapsed / (self.duration_secs as u128)) as u64
    }

    /// What `vest` may move right now.
    pub fn releasable_raw(&self, now: i64) -> u64 {
        let scheduled = self.scheduled_raw(now).min(self.release_cap_raw);
        scheduled.saturating_sub(self.released_raw)
    }
}

/// The Pyth price a sweep was verified against. `feed` all-zero means no stamp (intake).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug, PartialEq, Eq)]
pub struct PriceStamp {
    pub feed: [u8; 32],
    pub price: i64,
    pub expo: i32,
    pub conf: u64,
    pub publish_time: i64,
}

/// One keep-rate measurement. `at == 0` means not yet measured.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace, Debug, PartialEq, Eq)]
pub struct Measurement {
    pub at: i64,
    /// The recipient's TOTAL raw balance of the asset at that instant. Raw, so a rebase
    /// never reads as a sale.
    pub balance_raw: u64,
}

/// THE RECEIPT — permanent, ~350 bytes, written in the same transaction as the conversion.
///
/// `["receipt", book, release_id]` for a sweep; `["receipt", payout, release_id]` for an
/// intake. A memory that lives only in a database is one that can be lost or be accused of
/// invention. This one can be opened by anyone, forever, and outlives the company.
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub kind: ReceiptKind,
    pub recipient: Pubkey,
    /// Sweep: default (attributed off chain from transfer history). Intake: the payer.
    pub payer: Pubkey,
    /// Who paid the fee and signed: the keeper, the payer, or the relayer.
    pub submitter: Pubkey,
    /// The recipient's Book.
    pub book: Pubkey,
    pub release_id: [u8; 16],
    /// The payroll run this receipt belongs to, or zero.
    pub run_id: [u8; 16],
    /// Zero for a sweep.
    pub reason_hash: [u8; 32],
    /// Sweep: the net inflow that triggered it. Intake: what was paid.
    pub basis_usdc: u64,
    /// Sweep: the rate applied. Intake: 10_000.
    pub rate_bps: u16,
    /// The USDC actually converted.
    pub paid_usdc: u64,
    pub asset: Pubkey,
    /// Raw token units received. Never a UI amount.
    pub amount_raw: u64,
    pub price: PriceStamp,
    pub settled_slot: u64,
    pub settled_unix: i64,
    pub measured_7d: Measurement,
    pub measured_30d: Measurement,
    pub bump: u8,
}

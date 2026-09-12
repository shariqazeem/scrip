#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;

declare_id!("3siGeKgHp7pvVVmjbdtBemeirNRPSFHyMXBJu3CXZ3hX");

/// # Webgold — the rule and the record
///
/// THE PROGRAM IS NEVER THE VAULT.
///
/// Two rules that do not bend, and every instruction added here is measured against them:
///
/// 1. **Assets are held only while they are under a rule.** An escrowed payout on its way to a
///    recipient, and nothing else. A settled position sits in the recipient's OWN token
///    account. A pooled claim on a basket of tokenized securities would make this a fund;
///    direct ownership does not, and that distinction is load-bearing.
///
/// 2. **The program never decides who deserves money, and never picks an asset.** A payout
///    carries a payer, recipients, a dollar value, a reason string and an optional constraint
///    on the asset SET. Verification happens somewhere else, or nowhere. The recipient's own
///    signed policy decides what the value becomes — weights come from that policy, prices
///    from Pyth, routing from Jupiter. Software executes a rule here; it never exercises
///    discretion over someone's money.
#[program]
pub mod webgold {
    use super::*;

    /// Open a book. One per owner, at a deterministic address anyone can derive.
    ///
    /// The book holds the signed policy and the lifetime counters. It never holds an asset,
    /// and there is no instruction here that could make it hold one.
    pub fn open_book(ctx: Context<OpenBook>, policy: Policy) -> Result<()> {
        let policy = policy.validated()?;
        let clock = Clock::get()?;
        let book = &mut ctx.accounts.book;

        book.owner = ctx.accounts.owner.key();
        book.bump = ctx.bumps.book;
        book.version = BOOK_VERSION;
        book.opened_at = clock.unix_timestamp;
        book.lifetime_received = 0;
        book.lifetime_sent = 0;
        book.policy = policy;
        book.policy.updated_at = clock.unix_timestamp;

        emit!(BookOpened {
            book: book.key(),
            owner: book.owner,
            at: clock.unix_timestamp,
            legs: book.policy.legs.clone(),
        });
        Ok(())
    }

    /// Replace the mix policy. Only the owner may, and only with one that validates.
    ///
    /// THE POLICY IS THE ONLY PLACE A WEIGHT CAN COME FROM. There is deliberately no
    /// instruction that lets an operator, a model or this program choose a weight for
    /// somebody. That absence is the product.
    pub fn set_policy(ctx: Context<SetPolicy>, policy: Policy) -> Result<()> {
        let policy = policy.validated()?;
        let clock = Clock::get()?;
        let book = &mut ctx.accounts.book;

        book.policy = policy;
        book.policy.updated_at = clock.unix_timestamp;

        emit!(PolicySet {
            book: book.key(),
            owner: book.owner,
            at: clock.unix_timestamp,
            legs: book.policy.legs.clone(),
        });
        Ok(())
    }

    /// Close a book and return its rent to the owner.
    ///
    /// Safe precisely because the program never held anything: closing a book cannot strand
    /// an asset, because the assets were never here. They are in the owner's token accounts
    /// and are untouched by this.
    pub fn close_book(ctx: Context<CloseBook>) -> Result<()> {
        emit!(BookClosed {
            book: ctx.accounts.book.key(),
            owner: ctx.accounts.owner.key(),
            at: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

pub const BOOK_VERSION: u8 = 1;

/// Basis points in a whole. A policy that does not sum to exactly this is refused.
pub const TOTAL_BPS: u16 = 10_000;

/// The ceiling on legs in one policy.
///
/// Eight is a product decision, not an arithmetic one: a mix a person cannot hold in their
/// head is a mix they did not really choose, and this is a savings book rather than a fund
/// factory. It also bounds the account size, so a book's rent is knowable in advance.
pub const MAX_LEGS: usize = 8;

/// The widest drift band a policy may set before a rebalance is due.
///
/// Capped at 50% because a band wider than that is not a band — it is a policy that never
/// rebalances, wearing the shape of one that does.
pub const MAX_DRIFT_BPS: u16 = 5_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, Debug, PartialEq, Eq)]
pub struct Leg {
    pub mint: Pubkey,
    pub bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, Debug, PartialEq, Eq)]
pub struct Policy {
    #[max_len(MAX_LEGS)]
    pub legs: Vec<Leg>,
    /// How far a leg may drift from its target before a rebalance is due, in basis points.
    pub drift_bps: u16,
    /// Set by the program from the clock, never by the caller. Any value passed in is
    /// overwritten — a timestamp a caller can choose is a timestamp that proves nothing.
    pub updated_at: i64,
}

impl Policy {
    /// Every invariant a policy must satisfy, in one place, so the same rule cannot be
    /// enforced differently by two instructions.
    ///
    /// `src/lib/policy.ts` mirrors this for the client, and a test reads BOTH — the client
    /// must never be able to build a policy the program will refuse, because the user finds
    /// out by paying for a failed transaction.
    pub fn validated(self) -> Result<Self> {
        require!(!self.legs.is_empty(), WebgoldError::PolicyEmpty);
        require!(self.legs.len() <= MAX_LEGS, WebgoldError::PolicyTooManyLegs);
        require!(self.drift_bps <= MAX_DRIFT_BPS, WebgoldError::DriftBandTooWide);

        let mut total: u32 = 0;
        for (i, leg) in self.legs.iter().enumerate() {
            // A zero-weight leg holds nothing and buys nothing, but it WOULD smuggle a mint
            // into a policy's whitelist. Refused so the leg list and the permitted-asset list
            // can never mean different things.
            require!(leg.bps > 0, WebgoldError::LegWeightZero);
            require!(leg.mint != Pubkey::default(), WebgoldError::LegMintDefault);
            // Duplicates would sum to the right total while meaning something else entirely.
            for other in self.legs.iter().skip(i + 1) {
                require!(leg.mint != other.mint, WebgoldError::LegDuplicated);
            }
            total = total
                .checked_add(leg.bps as u32)
                .ok_or(WebgoldError::PolicyWeightsOverflow)?;
        }
        require!(total == TOTAL_BPS as u32, WebgoldError::PolicyWeightsWrong);

        Ok(self)
    }
}

#[account]
#[derive(InitSpace)]
pub struct Book {
    pub owner: Pubkey,
    pub bump: u8,
    pub version: u8,
    pub opened_at: i64,
    /// Lifetime USD value received, in 6-decimal base units.
    pub lifetime_received: u64,
    /// Lifetime USD value sent, in 6-decimal base units.
    pub lifetime_sent: u64,
    pub policy: Policy,
}

#[derive(Accounts)]
pub struct OpenBook<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + Book::INIT_SPACE,
        seeds = [b"book", owner.key().as_ref()],
        bump,
    )]
    pub book: Account<'info, Book>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPolicy<'info> {
    #[account(
        mut,
        seeds = [b"book", owner.key().as_ref()],
        bump = book.bump,
        // Belt and braces. The seed constraint already binds the book to this signer; the
        // explicit check means a future refactor that loosens the seeds cannot silently let
        // somebody else rewrite a stranger's mix.
        has_one = owner @ WebgoldError::NotTheOwner,
    )]
    pub book: Account<'info, Book>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CloseBook<'info> {
    #[account(
        mut,
        seeds = [b"book", owner.key().as_ref()],
        bump = book.bump,
        has_one = owner @ WebgoldError::NotTheOwner,
        close = owner,
    )]
    pub book: Account<'info, Book>,
    #[account(mut)]
    pub owner: Signer<'info>,
}

#[event]
pub struct BookOpened {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub at: i64,
    pub legs: Vec<Leg>,
}

#[event]
pub struct PolicySet {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub at: i64,
    pub legs: Vec<Leg>,
}

#[event]
pub struct BookClosed {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub at: i64,
}

/// Errors say what is wrong in words a person can act on. An error a user meets on a failed
/// transaction is user-facing copy, whether or not anyone designed it as such.
#[error_code]
pub enum WebgoldError {
    #[msg("A mix policy must have at least one leg.")]
    PolicyEmpty,
    #[msg("A mix policy may hold at most 8 legs.")]
    PolicyTooManyLegs,
    #[msg("Mix weights must add up to exactly 100%.")]
    PolicyWeightsWrong,
    #[msg("Mix weights overflowed while being added up.")]
    PolicyWeightsOverflow,
    #[msg("A leg cannot have a weight of zero — remove it instead.")]
    LegWeightZero,
    #[msg("A leg cannot name the default address as its mint.")]
    LegMintDefault,
    #[msg("The same mint appears twice in this mix.")]
    LegDuplicated,
    #[msg("The drift band cannot be wider than 50%.")]
    DriftBandTooWide,
    #[msg("Only the owner of this book can change it.")]
    NotTheOwner,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mint(n: u8) -> Pubkey {
        Pubkey::new_from_array([n; 32])
    }

    fn policy(legs: Vec<(Pubkey, u16)>) -> Policy {
        Policy {
            legs: legs.into_iter().map(|(mint, bps)| Leg { mint, bps }).collect(),
            drift_bps: 500,
            updated_at: 0,
        }
    }

    /// The product's real default, and the reason this invariant exists at all.
    #[test]
    fn the_default_mix_validates() {
        let p = policy(vec![(mint(1), 7_000), (mint(2), 3_000)]);
        assert!(p.validated().is_ok());
    }

    #[test]
    fn weights_must_sum_to_exactly_ten_thousand() {
        // 99.99% is not 100%. A policy that nearly adds up leaves a sliver of value with no
        // instruction about where it goes, and "nearly" is not a rule.
        assert!(policy(vec![(mint(1), 7_000), (mint(2), 2_999)]).validated().is_err());
        assert!(policy(vec![(mint(1), 7_000), (mint(2), 3_001)]).validated().is_err());
        assert!(policy(vec![(mint(1), 10_000)]).validated().is_ok());
    }

    #[test]
    fn a_zero_weight_leg_is_refused() {
        // It holds nothing and buys nothing, but it would smuggle a mint into the policy's
        // whitelist — so the leg list and the permitted-asset list stay the same list.
        assert!(policy(vec![(mint(1), 10_000), (mint(2), 0)]).validated().is_err());
    }

    #[test]
    fn a_duplicated_mint_is_refused() {
        // This sums to exactly 10,000 and means something nobody signed.
        assert!(policy(vec![(mint(1), 5_000), (mint(1), 5_000)]).validated().is_err());
    }

    #[test]
    fn an_empty_policy_is_refused() {
        assert!(policy(vec![]).validated().is_err());
    }

    #[test]
    fn the_default_pubkey_cannot_be_a_mint() {
        assert!(policy(vec![(Pubkey::default(), 10_000)]).validated().is_err());
    }

    #[test]
    fn more_than_eight_legs_is_refused() {
        let legs: Vec<(Pubkey, u16)> = (1..=9u8).map(|i| (mint(i), if i == 1 { 2_000 } else { 1_000 })).collect();
        assert_eq!(legs.iter().map(|l| l.1 as u32).sum::<u32>(), 10_000);
        assert!(policy(legs).validated().is_err());
    }

    #[test]
    fn exactly_eight_legs_is_allowed() {
        let legs: Vec<(Pubkey, u16)> = (1..=8u8).map(|i| (mint(i), if i == 1 { 3_000 } else { 1_000 })).collect();
        assert_eq!(legs.iter().map(|l| l.1 as u32).sum::<u32>(), 10_000);
        assert!(policy(legs).validated().is_ok());
    }

    #[test]
    fn a_drift_band_wider_than_half_is_refused() {
        let mut p = policy(vec![(mint(1), 10_000)]);
        p.drift_bps = MAX_DRIFT_BPS;
        assert!(p.clone().validated().is_ok());
        p.drift_bps = MAX_DRIFT_BPS + 1;
        assert!(p.validated().is_err());
    }

    #[test]
    fn summing_weights_cannot_overflow_a_u16_into_a_pass() {
        // Each leg is a u16, so eight of them can reach 524,280 — well past 10,000. The sum
        // is accumulated in a u32 precisely so a wrap can never land on the target.
        let legs: Vec<(Pubkey, u16)> = (1..=8u8).map(|i| (mint(i), u16::MAX)).collect();
        assert!(policy(legs).validated().is_err());
    }
}

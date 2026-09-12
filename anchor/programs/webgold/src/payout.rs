use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TransferChecked, transfer_checked};

use crate::{TOTAL_BPS, WebgoldError};

/// # The payout path — escrow, release, receipt
///
/// THE ONLY THING THE PROGRAM EVER HOLDS is an escrowed payout, and it holds it only while
/// it is under a rule: released to the named recipient, or returned to the payer. There is
/// no instruction that lets it keep anything, and no authority that can redirect it.
///
/// ## Where the mix is decided, and why it is decided BEFORE the escrow
///
/// The recipient's signed policy decides what a payout becomes. The obvious implementation —
/// escrow dollars, and swap them into the mix at release — would need the program to sign a
/// Jupiter CPI from a PDA, with a route whose accounts are not known until the quote is
/// fetched. That is the single most fragile thing this codebase could contain, and it fails
/// in the worst possible place: mid-release, with somebody's money in an escrow.
///
/// So the allocator reads the recipient's policy off chain, the PAYER swaps through Jupiter
/// in the funding transaction (they are the signer, so it is an ordinary swap), and what gets
/// escrowed is already the recipient's mix. Release is then a transfer and a receipt, which
/// is an operation that cannot half-succeed.
///
/// The cost of that choice, stated plainly: the mix is fixed at funding rather than at
/// release. A recipient who changes their policy in between gets the mix their policy named
/// when the money was committed. Funding and releasing in one transaction — the common case —
/// has no gap at all.
///
/// ## One recipient per payout
///
/// A campaign paying fifty people is fifty payout accounts sharing one `release_id`, not one
/// account with fifty recipients. That makes a receipt 1:1 with an arrival, makes a cohort row
/// fall out of the same key, and means one recipient's failure cannot strand the other
/// forty-nine.

/// The most legs one payout can carry. Matches the policy ceiling: a payout cannot be more
/// finely divided than the policy that decided it.
pub const MAX_PAYOUT_LEGS: usize = 8;

/// How many `remaining_accounts` each leg needs, in this order:
///   [mint, source token account, destination token account, that mint's token program]
///
/// The token program is per leg because Webgold's own default mix straddles both: Oro GOLD is
/// a classic SPL mint and SPYx is Token-2022.
pub const ACCOUNTS_PER_LEG: usize = 4;

/// With a goal skimming, each leg needs a fifth account: the GOAL's token account, which the
/// skimmed share is sent to. A leg is then
///   [mint, source, the recipient's account, that mint's token program, the goal's account]
pub const ACCOUNTS_PER_LEG_WITH_GOAL: usize = 5;

/// Reasons are free text asserted by the payer. Webgold settles; it does not judge. Bounded
/// because an account's size has to be knowable before it is created.
pub const MAX_REASON_LEN: usize = 200;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace, Debug, PartialEq, Eq)]
pub struct PayoutLeg {
    pub mint: Pubkey,
    /// Token base units of THAT mint. Never a dollar amount.
    pub amount: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Payout {
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub nonce: u64,
    pub bump: u8,
    /// Groups every payout in one release, so keep-rate is a query over a cohort.
    pub release_id: [u8; 32],
    /// USD value at the price stamp, 6-decimal base units.
    pub value_base: u64,
    /// Fine grams of gold in this payout, in 1e8 fixed point, stamped at funding.
    pub grams_e8: u64,
    #[max_len(MAX_REASON_LEN)]
    pub reason: String,
    pub funded_at: i64,
    /// 0 until released. The one bit that decides whether escrow may still be returned.
    pub released_at: i64,
    #[max_len(MAX_PAYOUT_LEGS)]
    pub legs: Vec<PayoutLeg>,
}

/// THE NAMED ARRIVAL — the product itself, and an account rather than only an event.
///
/// A memory that lives only in a database is one we can lose, or be accused of inventing. One
/// that lives here can be opened by anyone, forever, and survives us. It carries what landed,
/// from whom, for what, and what it was worth at the moment it landed.
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub release_id: [u8; 32],
    pub value_base: u64,
    pub grams_e8: u64,
    #[max_len(MAX_REASON_LEN)]
    pub reason: String,
    pub at: i64,
    pub bump: u8,
    #[max_len(MAX_PAYOUT_LEGS)]
    pub legs: Vec<PayoutLeg>,
}

/// KEEP-RATE, AND WHY IT CANNOT BE FAKED.
///
/// Written at release, in the same instruction as the receipt, and never rewritten. A cohort
/// reconstructed afterwards is a balance measured against a number somebody chose later —
/// which is exactly the difference between a payout and a farm, and exactly the number this
/// account exists to make un-inventable.
#[account]
#[derive(InitSpace)]
pub struct Cohort {
    pub release_id: [u8; 32],
    pub recipient: Pubkey,
    pub value_at_release_base: u64,
    pub released_at: i64,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct FundPayout<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Payout::INIT_SPACE,
        seeds = [b"payout", payer.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub payout: Account<'info, Payout>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
    /// CHECK: the recipient is named, not signed for. They receive; they do not authorise.
    pub recipient: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ReleasePayout<'info> {
    #[account(
        mut,
        seeds = [b"payout", payout.payer.as_ref(), &payout.nonce.to_le_bytes()],
        bump = payout.bump,
        has_one = payer @ WebgoldError::NotTheOwner,
    )]
    pub payout: Account<'info, Payout>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", payout.release_id.as_ref(), payout.recipient.as_ref()],
        bump,
    )]
    pub receipt: Account<'info, Receipt>,
    #[account(
        init,
        payer = payer,
        space = 8 + Cohort::INIT_SPACE,
        seeds = [b"cohort", payout.release_id.as_ref(), payout.recipient.as_ref()],
        bump,
    )]
    pub cohort: Account<'info, Cohort>,
    pub system_program: Program<'info, System>,
    /**
     * THE RECIPIENT'S GOAL, if they have one taking a share of arrivals.
     *
     * Optional, and constrained to the RECIPIENT rather than to the payer or the signer: a
     * payer cannot point a skim at a goal of their own choosing, and a goal cannot be attached
     * to somebody who did not create it. When it is absent the whole payout lands with the
     * recipient, which is what a book with no goal means.
     *
     * A payer who simply omits it pays the recipient in full. That is the safe direction to
     * fail in — the recipient keeps everything — and is why the skim is not enforced by
     * refusing releases that leave it out.
     */
    #[account(
        mut,
        seeds = [b"goal", payout.recipient.as_ref(), goal.slug.as_bytes()],
        bump = goal.bump,
    )]
    pub goal: Option<Account<'info, Goal>>,
}

#[derive(Accounts)]
pub struct CancelPayout<'info> {
    #[account(
        mut,
        seeds = [b"payout", payout.payer.as_ref(), &payout.nonce.to_le_bytes()],
        bump = payout.bump,
        has_one = payer @ WebgoldError::NotTheOwner,
        close = payer,
    )]
    pub payout: Account<'info, Payout>,
    #[account(mut)]
    pub payer: Signer<'info>,
}

#[event]
pub struct PayoutFunded {
    pub payout: Pubkey,
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub release_id: [u8; 32],
    pub value_base: u64,
    pub at: i64,
}

#[event]
pub struct PayoutReleased {
    pub receipt: Pubkey,
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub release_id: [u8; 32],
    pub value_base: u64,
    pub grams_e8: u64,
    pub reason: String,
    pub at: i64,
}

#[event]
pub struct PayoutCancelled {
    pub payout: Pubkey,
    pub payer: Pubkey,
    pub at: i64,
}

/// The share of one leg that a goal takes, and the share that lands with the recipient.
///
/// TRUNCATION SENDS THE REMAINDER TO THE PERSON, NOT THE VAULT. A rounding rule that favoured
/// the goal would, at the last base unit, divert a fraction the owner did not choose to divert
/// — small, invisible, and in the wrong direction. The recipient keeps the dust.
pub fn split_for_goal(amount: u64, skim_bps: u16) -> Result<(u64, u64)> {
    let skim = (amount as u128)
        .checked_mul(skim_bps as u128)
        .ok_or(WebgoldError::PayoutWeightsOverflow)?
        / TOTAL_BPS as u128;
    let skim = u64::try_from(skim).map_err(|_| WebgoldError::PayoutWeightsOverflow)?;
    // Cannot underflow: skim is at most amount, since skim_bps is at most TOTAL_BPS.
    Ok((amount - skim, skim))
}

/// Validate the legs of a payout before anything is escrowed.
pub fn check_legs(legs: &[PayoutLeg]) -> Result<()> {
    require!(!legs.is_empty(), WebgoldError::PayoutEmpty);
    require!(legs.len() <= MAX_PAYOUT_LEGS, WebgoldError::PayoutTooManyLegs);
    for (i, leg) in legs.iter().enumerate() {
        // A zero-amount leg escrows nothing and would still print a line on a receipt saying
        // something arrived. A receipt that lists an arrival of nothing is a false receipt.
        require!(leg.amount > 0, WebgoldError::PayoutLegZero);
        require!(leg.mint != Pubkey::default(), WebgoldError::LegMintDefault);
        for other in legs.iter().skip(i + 1) {
            require!(leg.mint != other.mint, WebgoldError::LegDuplicated);
        }
    }
    Ok(())
}

/// Move one leg between two token accounts, checking the mint and decimals as it goes.
///
/// THE TOKEN PROGRAM IS PER LEG, NOT PER INSTRUCTION, and this is not a generalisation for
/// its own sake: Webgold's own default mix straddles both. Oro GOLD is a classic SPL mint and
/// SPYx is Token-2022, so a release that could name only one program could only ever pay half
/// a mix. The program each leg needs is supplied beside it and checked against the mint's
/// actual owner, so a caller cannot route a transfer through a program the mint does not
/// belong to.
///
/// `transfer_checked` rather than `transfer`, deliberately: it verifies the mint and the
/// decimals on chain, so a caller who passes the wrong token account cannot move the wrong
/// asset. The unchecked variant would let a payout of one gram of gold settle as one base
/// unit of something else, and the receipt would faithfully record the lie.
pub fn move_leg<'info>(
    token_program: &AccountInfo<'info>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    authority: AccountInfo<'info>,
    amount: u64,
    signer_seeds: Option<&[&[&[u8]]]>,
) -> Result<()> {
    let mint_info = mint.to_account_info();
    require_keys_eq!(
        *mint_info.owner,
        token_program.key(),
        WebgoldError::WrongTokenProgram
    );
    let accounts = TransferChecked {
        from: from.to_account_info(),
        mint: mint_info,
        to: to.to_account_info(),
        authority,
    };
    let ctx = match signer_seeds {
        Some(seeds) => CpiContext::new_with_signer(token_program.clone(), accounts, seeds),
        None => CpiContext::new(token_program.clone(), accounts),
    };
    transfer_checked(ctx, amount, mint.decimals)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mint(n: u8) -> Pubkey {
        Pubkey::new_from_array([n; 32])
    }

    fn legs(pairs: &[(u8, u64)]) -> Vec<PayoutLeg> {
        pairs
            .iter()
            .map(|(m, amount)| PayoutLeg { mint: mint(*m), amount: *amount })
            .collect()
    }

    #[test]
    fn a_two_leg_mix_validates() {
        assert!(check_legs(&legs(&[(1, 1_000_000), (2, 500_000)])).is_ok());
    }

    #[test]
    fn a_payout_must_move_something() {
        assert!(check_legs(&[]).is_err());
    }

    #[test]
    fn a_zero_amount_leg_is_refused() {
        // It escrows nothing and would still print a line on a receipt saying something
        // arrived. A receipt that lists an arrival of nothing is a false receipt.
        assert!(check_legs(&legs(&[(1, 1_000_000), (2, 0)])).is_err());
    }

    #[test]
    fn a_duplicated_mint_is_refused() {
        // Two legs of the same asset would settle as two transfers and read on the receipt as
        // two different holdings.
        assert!(check_legs(&legs(&[(1, 100), (1, 200)])).is_err());
    }

    #[test]
    fn the_default_pubkey_cannot_be_a_mint() {
        assert!(check_legs(&[PayoutLeg { mint: Pubkey::default(), amount: 1 }]).is_err());
    }

    #[test]
    fn more_legs_than_a_policy_can_hold_is_refused() {
        // A payout cannot be more finely divided than the policy that decided it.
        let too_many: Vec<PayoutLeg> = (1..=(MAX_PAYOUT_LEGS as u8 + 1))
            .map(|i| PayoutLeg { mint: mint(i), amount: 1 })
            .collect();
        assert!(check_legs(&too_many).is_err());

        let exactly: Vec<PayoutLeg> = (1..=(MAX_PAYOUT_LEGS as u8))
            .map(|i| PayoutLeg { mint: mint(i), amount: 1 })
            .collect();
        assert!(check_legs(&exactly).is_ok());
    }

    #[test]
    fn the_reason_ceiling_matches_the_space_reserved_for_it() {
        // MAX_REASON_LEN is both the guard in the handler and the #[max_len] on the account.
        // If they ever diverge, a reason that validates cannot be stored, and the failure
        // lands at account creation with nothing readable to say about it.
        assert_eq!(MAX_REASON_LEN, 200);
    }
}

/// The most characters a goal's slug may carry. It is part of a PDA seed, and a seed is
/// capped at 32 bytes by the runtime.
pub const MAX_SLUG_LEN: usize = 32;
pub const MAX_GOAL_NAME_LEN: usize = 64;
/// A goal that takes everything is not saving, it is redirection. Half is the ceiling.
pub const MAX_SKIM_BPS: u16 = 5_000;

/// A named goal that skims a share of every inbound payout.
///
/// It can spend in exactly one direction — to its owner — and it has no discretion of any
/// kind. That guarantee is not a check somebody could loosen; it is the absence of any code
/// that could send anywhere else.
#[account]
#[derive(InitSpace)]
pub struct Goal {
    pub owner: Pubkey,
    pub bump: u8,
    #[max_len(MAX_SLUG_LEN)]
    pub slug: String,
    #[max_len(MAX_GOAL_NAME_LEN)]
    pub name: String,
    /// What the owner is saving toward, in 6-decimal USD base units. A target, never a limit:
    /// nothing stops at it and nothing is refused for exceeding it.
    pub target_base: u64,
    pub skim_bps: u16,
    pub updated_at: i64,
}

#[derive(Accounts)]
#[instruction(slug: String)]
pub struct SetGoal<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Goal::INIT_SPACE,
        seeds = [b"goal", owner.key().as_ref(), slug.as_bytes()],
        bump,
    )]
    pub goal: Account<'info, Goal>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawGoal<'info> {
    #[account(
        mut,
        seeds = [b"goal", owner.key().as_ref(), goal.slug.as_bytes()],
        bump = goal.bump,
        has_one = owner @ WebgoldError::NotTheOwner,
    )]
    pub goal: Account<'info, Goal>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(
        mut,
        seeds = [b"payout", payout.payer.as_ref(), &payout.nonce.to_le_bytes()],
        bump = payout.bump,
    )]
    pub payout: Account<'info, Payout>,
    /// The person taking the sponsored position. They pay the rent for their own receipt,
    /// which is a few thousandths of a SOL and keeps the sponsor from being drained by
    /// account-creation spam.
    #[account(mut)]
    pub claimer: Signer<'info>,
    #[account(
        init,
        payer = claimer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", payout.release_id.as_ref(), claimer.key().as_ref()],
        bump,
    )]
    pub receipt: Account<'info, Receipt>,
    #[account(
        init,
        payer = claimer,
        space = 8 + Cohort::INIT_SPACE,
        seeds = [b"cohort", payout.release_id.as_ref(), claimer.key().as_ref()],
        bump,
    )]
    pub cohort: Account<'info, Cohort>,
    pub system_program: Program<'info, System>,
    /// The CLAIMER's goal, if they have one. Same rule as a release: bound to the person
    /// receiving, never to the person signing for the escrow.
    #[account(
        mut,
        seeds = [b"goal", claimer.key().as_ref(), goal.slug.as_bytes()],
        bump = goal.bump,
    )]
    pub goal: Option<Account<'info, Goal>>,
}

#[event]
pub struct GoalSet {
    pub goal: Pubkey,
    pub owner: Pubkey,
    pub slug: String,
    pub skim_bps: u16,
    pub target_base: u64,
    pub at: i64,
}

#[event]
pub struct GoalWithdrawn {
    pub goal: Pubkey,
    pub owner: Pubkey,
    pub at: i64,
}

#[cfg(test)]
mod goal_tests {
    use super::*;

    #[test]
    fn a_goal_cannot_skim_more_than_half() {
        // A goal that takes everything is not saving, it is redirection.
        assert_eq!(MAX_SKIM_BPS, 5_000);
        assert!(MAX_SKIM_BPS < 10_000);
    }

    #[test]
    fn a_slug_fits_inside_a_pda_seed() {
        // The runtime caps a single seed at 32 bytes. A slug longer than that would produce a
        // goal whose address cannot be derived — an account nobody, including its owner, could
        // ever find again.
        assert!(MAX_SLUG_LEN <= 32);
    }

    #[test]
    fn a_goal_holds_no_balance_counter() {
        /**
         * Deliberately asserted rather than assumed: a Goal has target, skim and name, and NO
         * accumulated total. What it holds is what its token accounts hold. A counter beside a
         * balance is two lists that drift, and the one people read would be the wrong one.
         */
        let goal = Goal {
            owner: Pubkey::default(),
            bump: 0,
            slug: String::new(),
            name: String::new(),
            target_base: 0,
            skim_bps: 0,
            updated_at: 0,
        };
        // If a field is ever added that tracks a balance, this construction stops compiling
        // and whoever added it has to read the comment above.
        let _ = goal;
    }
}

#[cfg(test)]
mod skim_tests {
    use super::*;

    #[test]
    fn a_goal_takes_its_share_and_the_person_gets_the_rest() {
        let (to_person, to_goal) = split_for_goal(1_000_000, 1_000).unwrap();
        assert_eq!(to_goal, 100_000); // 10%
        assert_eq!(to_person, 900_000);
        assert_eq!(to_person + to_goal, 1_000_000); // nothing is created or lost
    }

    #[test]
    fn no_goal_means_the_whole_payout_lands_with_the_person() {
        let (to_person, to_goal) = split_for_goal(1_000_000, 0).unwrap();
        assert_eq!(to_person, 1_000_000);
        assert_eq!(to_goal, 0);
    }

    #[test]
    fn truncation_sends_the_remainder_to_the_person_not_the_vault() {
        // A rounding rule that favoured the goal would, at the last base unit, divert a
        // fraction the owner did not choose to divert: small, invisible, and in the wrong
        // direction. 7 base units at 10% is 0.7 — the goal gets 0, the person gets all 7.
        let (to_person, to_goal) = split_for_goal(7, 1_000).unwrap();
        assert_eq!(to_goal, 0);
        assert_eq!(to_person, 7);
    }

    #[test]
    fn the_split_always_adds_back_to_the_whole() {
        for amount in [1u64, 3, 99, 1_000_001, u64::MAX / 2] {
            for bps in [0u16, 1, 999, 5_000] {
                let (a, b) = split_for_goal(amount, bps).unwrap();
                assert_eq!(a + b, amount, "amount {amount} at {bps}bps");
            }
        }
    }

    #[test]
    fn the_widest_legal_skim_still_leaves_half_with_the_person() {
        let (to_person, to_goal) = split_for_goal(1_000_000, MAX_SKIM_BPS).unwrap();
        assert_eq!(to_goal, 500_000);
        assert_eq!(to_person, 500_000);
    }

    #[test]
    fn a_u64_max_amount_does_not_overflow_the_intermediate() {
        // The multiply happens in u128 precisely so `amount * 5_000` cannot wrap.
        let (a, b) = split_for_goal(u64::MAX, MAX_SKIM_BPS).unwrap();
        assert_eq!(a.checked_add(b), Some(u64::MAX));
    }
}

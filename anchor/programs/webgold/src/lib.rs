#![allow(unexpected_cfgs)]
use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount};

pub mod payout;
pub use payout::*;

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

    /// Escrow a payout for one named recipient.
    ///
    /// `remaining_accounts` carries three accounts per leg, in leg order:
    ///   [mint, the payer's token account, the payout's token account, that mint's token program]
    /// The payout's token accounts are created by the caller in the same transaction; this
    /// program never creates an account it does not own the rule for.
    ///
    /// What is escrowed is ALREADY the recipient's mix — see payout.rs for why the swap
    /// happens in the payer's own funding transaction rather than in a PDA-signed Jupiter CPI
    /// at release.
    pub fn fund_payout<'info>(
        ctx: Context<'_, '_, 'info, 'info, FundPayout<'info>>,
        nonce: u64,
        release_id: [u8; 32],
        value_base: u64,
        grams_e8: u64,
        reason: String,
        legs: Vec<PayoutLeg>,
    ) -> Result<()> {
        check_legs(&legs)?;
        require!(reason.len() <= MAX_REASON_LEN, WebgoldError::ReasonTooLong);
        require!(value_base > 0, WebgoldError::PayoutValueZero);
        require!(
            ctx.remaining_accounts.len() == legs.len() * ACCOUNTS_PER_LEG,
            WebgoldError::LegAccountsMismatch
        );

        let clock = Clock::get()?;
        let payout_key = ctx.accounts.payout.key();

        for (i, leg) in legs.iter().enumerate() {
            let mint = InterfaceAccount::<Mint>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG])?;
            let from =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 1])?;
            let to =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 2])?;

            // Each of these is a way a caller could move the wrong asset, or move the right
            // asset somewhere it is not under a rule.
            require_keys_eq!(mint.key(), leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(from.mint, leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(to.mint, leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(from.owner, ctx.accounts.payer.key(), WebgoldError::LegWrongOwner);
            require_keys_eq!(to.owner, payout_key, WebgoldError::EscrowNotUnderRule);

            move_leg(
                &ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 3],
                &from,
                &to,
                &mint,
                ctx.accounts.payer.to_account_info(),
                leg.amount,
                None,
            )?;
        }

        let payout = &mut ctx.accounts.payout;
        payout.payer = ctx.accounts.payer.key();
        payout.recipient = ctx.accounts.recipient.key();
        payout.nonce = nonce;
        payout.bump = ctx.bumps.payout;
        payout.release_id = release_id;
        payout.value_base = value_base;
        payout.grams_e8 = grams_e8;
        payout.reason = reason;
        payout.funded_at = clock.unix_timestamp;
        payout.released_at = 0;
        payout.legs = legs;

        emit!(PayoutFunded {
            payout: payout_key,
            payer: payout.payer,
            recipient: payout.recipient,
            release_id: payout.release_id,
            value_base: payout.value_base,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Release an escrowed payout to its recipient, and write the receipt and the cohort.
    ///
    /// `remaining_accounts` carries three accounts per leg, in leg order:
    ///   [mint, the payout's token account, the recipient's token account, that mint's token program]
    ///
    /// The receipt and the cohort are created in the SAME instruction as the transfers, so
    /// there is no state in which value moved and no record of it exists. A cohort recorded
    /// afterwards is a number somebody chose later, which is the whole difference between a
    /// payout and a farm.
    pub fn release_payout<'info>(
        ctx: Context<'_, '_, 'info, 'info, ReleasePayout<'info>>,
    ) -> Result<()> {
        require!(ctx.accounts.payout.released_at == 0, WebgoldError::AlreadyReleased);
        // A payout with no named recipient is a claim path and belongs to `claim_payout`.
        // Releasing one here would let the payer choose the recipient AFTER funding, which is
        // the one thing a claim path exists not to allow.
        require_keys_neq!(
            ctx.accounts.payout.recipient,
            Pubkey::default(),
            WebgoldError::NotClaimable
        );
        let legs = ctx.accounts.payout.legs.clone();

        let clock = Clock::get()?;
        let payer = ctx.accounts.payout.payer;
        let recipient = ctx.accounts.payout.recipient;
        let nonce = ctx.accounts.payout.nonce.to_le_bytes();
        let bump = [ctx.accounts.payout.bump];
        let seeds: &[&[u8]] = &[b"payout", payer.as_ref(), &nonce, &bump];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let payout_key = ctx.accounts.payout.key();

        let skim_bps = ctx.accounts.goal.as_ref().map(|g| g.skim_bps).unwrap_or(0);
        let goal_key = ctx.accounts.goal.as_ref().map(|g| g.key());
        let stride = if goal_key.is_some() { ACCOUNTS_PER_LEG_WITH_GOAL } else { ACCOUNTS_PER_LEG };
        require!(
            ctx.remaining_accounts.len() == legs.len() * stride,
            WebgoldError::LegAccountsMismatch
        );

        for (i, leg) in legs.iter().enumerate() {
            let mint = InterfaceAccount::<Mint>::try_from(&ctx.remaining_accounts[i * stride])?;
            let from =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * stride + 1])?;
            let to =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * stride + 2])?;

            require_keys_eq!(mint.key(), leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(from.mint, leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(to.mint, leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(from.owner, payout_key, WebgoldError::EscrowNotUnderRule);
            // THE LINE THAT MAKES A RELEASE A RELEASE. Without it a payer could point the
            // destination anywhere and the receipt would faithfully record a payment to
            // somebody who never received it.
            require_keys_eq!(to.owner, recipient, WebgoldError::WrongRecipient);

            let (to_recipient, to_goal) = split_for_goal(leg.amount, skim_bps)?;
            let token_program = &ctx.remaining_accounts[i * stride + 3];

            if to_recipient > 0 {
                move_leg(
                    token_program,
                    &from,
                    &to,
                    &mint,
                    ctx.accounts.payout.to_account_info(),
                    to_recipient,
                    Some(signer_seeds),
                )?;
            }
            if let Some(goal_key) = goal_key {
                if to_goal > 0 {
                    let goal_account = InterfaceAccount::<TokenAccount>::try_from(
                        &ctx.remaining_accounts[i * stride + 4],
                    )?;
                    require_keys_eq!(goal_account.mint, leg.mint, WebgoldError::LegMintMismatch);
                    // The skim can only ever reach the recipient's OWN goal vault.
                    require_keys_eq!(
                        goal_account.owner,
                        goal_key,
                        WebgoldError::GoalPaysOnlyItsOwner
                    );
                    move_leg(
                        token_program,
                        &from,
                        &goal_account,
                        &mint,
                        ctx.accounts.payout.to_account_info(),
                        to_goal,
                        Some(signer_seeds),
                    )?;
                }
            }
        }

        let payout = &mut ctx.accounts.payout;
        payout.released_at = clock.unix_timestamp;
        let release_id = payout.release_id;
        let value_base = payout.value_base;
        let grams_e8 = payout.grams_e8;
        let reason = payout.reason.clone();

        let receipt = &mut ctx.accounts.receipt;
        receipt.payer = payer;
        receipt.recipient = recipient;
        receipt.release_id = release_id;
        receipt.value_base = value_base;
        receipt.grams_e8 = grams_e8;
        receipt.reason = reason.clone();
        receipt.at = clock.unix_timestamp;
        receipt.bump = ctx.bumps.receipt;
        receipt.legs = legs;
        let receipt_key = receipt.key();

        let cohort = &mut ctx.accounts.cohort;
        cohort.release_id = release_id;
        cohort.recipient = recipient;
        cohort.value_at_release_base = value_base;
        cohort.released_at = clock.unix_timestamp;
        cohort.bump = ctx.bumps.cohort;

        emit!(PayoutReleased {
            receipt: receipt_key,
            payer,
            recipient,
            release_id,
            value_base,
            grams_e8,
            reason,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Return an unreleased escrow to the payer and close the payout.
    ///
    /// `remaining_accounts` carries three accounts per leg, in leg order:
    ///   [mint, the payout's token account, the payer's token account, that mint's token program]
    ///
    /// Only while unreleased. Once a receipt exists somebody has been told they were paid,
    /// and there is no instruction here that can take that back.
    pub fn cancel_payout<'info>(
        ctx: Context<'_, '_, 'info, 'info, CancelPayout<'info>>,
    ) -> Result<()> {
        require!(ctx.accounts.payout.released_at == 0, WebgoldError::AlreadyReleased);
        let legs = ctx.accounts.payout.legs.clone();
        require!(
            ctx.remaining_accounts.len() == legs.len() * ACCOUNTS_PER_LEG,
            WebgoldError::LegAccountsMismatch
        );

        let clock = Clock::get()?;
        let payer = ctx.accounts.payout.payer;
        let nonce = ctx.accounts.payout.nonce.to_le_bytes();
        let bump = [ctx.accounts.payout.bump];
        let seeds: &[&[u8]] = &[b"payout", payer.as_ref(), &nonce, &bump];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let payout_key = ctx.accounts.payout.key();

        for (i, leg) in legs.iter().enumerate() {
            let mint = InterfaceAccount::<Mint>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG])?;
            let from =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 1])?;
            let to =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 2])?;

            require_keys_eq!(mint.key(), leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(from.owner, payout_key, WebgoldError::EscrowNotUnderRule);
            require_keys_eq!(to.owner, payer, WebgoldError::LegWrongOwner);
            require_keys_eq!(to.mint, leg.mint, WebgoldError::LegMintMismatch);

            move_leg(
                &ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 3],
                &from,
                &to,
                &mint,
                ctx.accounts.payout.to_account_info(),
                leg.amount,
                Some(signer_seeds),
            )?;
        }

        emit!(PayoutCancelled {
            payout: payout_key,
            payer,
            at: clock.unix_timestamp,
        });
        // The escrow's now-empty token accounts outlive this close. Deliberate and harmless:
        // a PDA signs from its seeds, not from an account that exists, so their rent stays
        // reclaimable after the payout account is gone.
        Ok(())
    }

    /// Claim a payout that names no recipient — the sponsored first position.
    ///
    /// A payout funded with the default pubkey as its recipient is a CLAIM PATH rather than a
    /// named payment: an issuer funds first grams into a book that does not exist yet, and
    /// whoever claims it becomes the recipient. Same escrow, same receipt, same cohort; the
    /// only difference is who signs and when the recipient is decided.
    ///
    /// ONE CLAIM PER PERSON PER CAMPAIGN, ENFORCED BY THE ACCOUNT MODEL RATHER THAN BY A
    /// CHECK. The receipt lives at [b"receipt", release_id, recipient], so a second claim by
    /// the same wallet in the same release tries to create an account that already exists and
    /// fails in the runtime. Nothing has to remember who claimed; the address IS the record.
    ///
    /// `remaining_accounts` carries four accounts per leg, in leg order:
    ///   [mint, the payout's token account, the claimer's token account, that mint's token program]
    pub fn claim_payout<'info>(
        ctx: Context<'_, '_, 'info, 'info, ClaimPayout<'info>>,
    ) -> Result<()> {
        require!(ctx.accounts.payout.released_at == 0, WebgoldError::AlreadyReleased);
        require_keys_eq!(
            ctx.accounts.payout.recipient,
            Pubkey::default(),
            WebgoldError::NotClaimable
        );
        let legs = ctx.accounts.payout.legs.clone();

        let clock = Clock::get()?;
        let payer = ctx.accounts.payout.payer;
        let claimer = ctx.accounts.claimer.key();
        let nonce = ctx.accounts.payout.nonce.to_le_bytes();
        let bump = [ctx.accounts.payout.bump];
        let seeds: &[&[u8]] = &[b"payout", payer.as_ref(), &nonce, &bump];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let payout_key = ctx.accounts.payout.key();

        let skim_bps = ctx.accounts.goal.as_ref().map(|g| g.skim_bps).unwrap_or(0);
        let goal_key = ctx.accounts.goal.as_ref().map(|g| g.key());
        let stride = if goal_key.is_some() { ACCOUNTS_PER_LEG_WITH_GOAL } else { ACCOUNTS_PER_LEG };
        require!(
            ctx.remaining_accounts.len() == legs.len() * stride,
            WebgoldError::LegAccountsMismatch
        );

        for (i, leg) in legs.iter().enumerate() {
            let mint = InterfaceAccount::<Mint>::try_from(&ctx.remaining_accounts[i * stride])?;
            let from =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * stride + 1])?;
            let to =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * stride + 2])?;

            require_keys_eq!(mint.key(), leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(from.mint, leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(to.mint, leg.mint, WebgoldError::LegMintMismatch);
            require_keys_eq!(from.owner, payout_key, WebgoldError::EscrowNotUnderRule);
            // The claimer signed, so this is the one place a destination is trustworthy by
            // construction — and it is still checked, because a signature proves who asked,
            // not where they asked for it to go.
            require_keys_eq!(to.owner, claimer, WebgoldError::WrongRecipient);

            let (to_claimer, to_goal) = split_for_goal(leg.amount, skim_bps)?;
            let token_program = &ctx.remaining_accounts[i * stride + 3];

            if to_claimer > 0 {
                move_leg(
                    token_program,
                    &from,
                    &to,
                    &mint,
                    ctx.accounts.payout.to_account_info(),
                    to_claimer,
                    Some(signer_seeds),
                )?;
            }
            if let Some(goal_key) = goal_key {
                if to_goal > 0 {
                    let goal_account = InterfaceAccount::<TokenAccount>::try_from(
                        &ctx.remaining_accounts[i * stride + 4],
                    )?;
                    require_keys_eq!(goal_account.mint, leg.mint, WebgoldError::LegMintMismatch);
                    require_keys_eq!(
                        goal_account.owner,
                        goal_key,
                        WebgoldError::GoalPaysOnlyItsOwner
                    );
                    move_leg(
                        token_program,
                        &from,
                        &goal_account,
                        &mint,
                        ctx.accounts.payout.to_account_info(),
                        to_goal,
                        Some(signer_seeds),
                    )?;
                }
            }
        }

        let payout = &mut ctx.accounts.payout;
        payout.released_at = clock.unix_timestamp;
        payout.recipient = claimer;
        let release_id = payout.release_id;
        let value_base = payout.value_base;
        let grams_e8 = payout.grams_e8;
        let reason = payout.reason.clone();

        let receipt = &mut ctx.accounts.receipt;
        receipt.payer = payer;
        receipt.recipient = claimer;
        receipt.release_id = release_id;
        receipt.value_base = value_base;
        receipt.grams_e8 = grams_e8;
        receipt.reason = reason.clone();
        receipt.at = clock.unix_timestamp;
        receipt.bump = ctx.bumps.receipt;
        receipt.legs = legs;
        let receipt_key = receipt.key();

        let cohort = &mut ctx.accounts.cohort;
        cohort.release_id = release_id;
        cohort.recipient = claimer;
        cohort.value_at_release_base = value_base;
        cohort.released_at = clock.unix_timestamp;
        cohort.bump = ctx.bumps.cohort;

        emit!(PayoutReleased {
            receipt: receipt_key,
            payer,
            recipient: claimer,
            release_id,
            value_base,
            grams_e8,
            reason,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Create or replace a goal: a named target that skims a share of every inbound payout.
    ///
    /// A goal holds value and has NO DISCRETION OF ANY KIND. There is exactly one instruction
    /// that moves anything out of it, `withdraw_goal`, and it can only send to the owner. No
    /// third party, no address the owner did not sign for, no exceptions — the absence of a
    /// second destination is the whole guarantee, and it is enforced by there being no code
    /// that could do it rather than by a check that could be loosened.
    pub fn set_goal(
        ctx: Context<SetGoal>,
        slug: String,
        name: String,
        target_base: u64,
        skim_bps: u16,
    ) -> Result<()> {
        require!(!slug.is_empty() && slug.len() <= MAX_SLUG_LEN, WebgoldError::GoalSlugLength);
        require!(!name.is_empty() && name.len() <= MAX_GOAL_NAME_LEN, WebgoldError::GoalNameLength);
        // A goal that takes everything is not saving, it is redirection. Half is the ceiling.
        require!(skim_bps <= MAX_SKIM_BPS, WebgoldError::SkimTooLarge);

        let clock = Clock::get()?;
        let goal = &mut ctx.accounts.goal;
        goal.owner = ctx.accounts.owner.key();
        goal.bump = ctx.bumps.goal;
        goal.slug = slug;
        goal.name = name;
        goal.target_base = target_base;
        goal.skim_bps = skim_bps;
        goal.updated_at = clock.unix_timestamp;

        emit!(GoalSet {
            goal: goal.key(),
            owner: goal.owner,
            slug: goal.slug.clone(),
            skim_bps,
            target_base,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Move everything a goal holds to its owner. The only direction it can spend.
    ///
    /// `remaining_accounts` carries four accounts per leg, in any order the caller likes:
    ///   [mint, the goal's token account, the OWNER's token account, that mint's token program]
    pub fn withdraw_goal<'info>(
        ctx: Context<'_, '_, 'info, 'info, WithdrawGoal<'info>>,
        amounts: Vec<u64>,
    ) -> Result<()> {
        require!(
            ctx.remaining_accounts.len() == amounts.len() * ACCOUNTS_PER_LEG,
            WebgoldError::LegAccountsMismatch
        );
        let clock = Clock::get()?;
        let owner = ctx.accounts.owner.key();
        let slug = ctx.accounts.goal.slug.clone();
        let bump = [ctx.accounts.goal.bump];
        let seeds: &[&[u8]] = &[b"goal", owner.as_ref(), slug.as_bytes(), &bump];
        let signer_seeds: &[&[&[u8]]] = &[seeds];
        let goal_key = ctx.accounts.goal.key();

        for (i, amount) in amounts.iter().enumerate() {
            require!(*amount > 0, WebgoldError::PayoutLegZero);
            let mint = InterfaceAccount::<Mint>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG])?;
            let from =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 1])?;
            let to =
                InterfaceAccount::<TokenAccount>::try_from(&ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 2])?;

            require_keys_eq!(from.owner, goal_key, WebgoldError::EscrowNotUnderRule);
            // THE ONE DESTINATION. There is no branch here that could send anywhere else.
            require_keys_eq!(to.owner, owner, WebgoldError::GoalPaysOnlyItsOwner);
            require_keys_eq!(from.mint, mint.key(), WebgoldError::LegMintMismatch);
            require_keys_eq!(to.mint, mint.key(), WebgoldError::LegMintMismatch);

            move_leg(
                &ctx.remaining_accounts[i * ACCOUNTS_PER_LEG + 3],
                &from,
                &to,
                &mint,
                ctx.accounts.goal.to_account_info(),
                *amount,
                Some(signer_seeds),
            )?;
        }

        emit!(GoalWithdrawn {
            goal: goal_key,
            owner,
            at: clock.unix_timestamp,
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
    #[msg("A payout amount overflowed while a goal's share was being worked out.")]
    PayoutWeightsOverflow,
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
    #[msg("A payout must move at least one asset.")]
    PayoutEmpty,
    #[msg("A payout may carry at most 8 legs.")]
    PayoutTooManyLegs,
    #[msg("A payout leg cannot be for zero — remove it instead.")]
    PayoutLegZero,
    #[msg("A payout must carry a value greater than zero.")]
    PayoutValueZero,
    #[msg("That reason is longer than 200 characters.")]
    ReasonTooLong,
    #[msg("The accounts supplied do not match the legs of this payout.")]
    LegAccountsMismatch,
    #[msg("A token account does not hold the mint this leg names.")]
    LegMintMismatch,
    #[msg("A token account is not owned by the account this leg requires.")]
    LegWrongOwner,
    #[msg("Escrow must be held by the payout account and nowhere else.")]
    EscrowNotUnderRule,
    #[msg("That destination does not belong to this payout's recipient.")]
    WrongRecipient,
    #[msg("This payout has already been released.")]
    AlreadyReleased,
    #[msg("That token program does not own the mint this leg names.")]
    WrongTokenProgram,
    #[msg("This payout names a recipient, so it cannot be claimed.")]
    NotClaimable,
    #[msg("A goal's slug must be between 1 and 32 characters.")]
    GoalSlugLength,
    #[msg("A goal's name must be between 1 and 64 characters.")]
    GoalNameLength,
    #[msg("A goal cannot skim more than half of an inbound payout.")]
    SkimTooLarge,
    #[msg("A goal can only ever pay its own owner.")]
    GoalPaysOnlyItsOwner,
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

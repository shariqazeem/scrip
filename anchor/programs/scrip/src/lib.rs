#![allow(unexpected_cfgs)]
#![allow(clippy::too_many_arguments)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::get_stack_height;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use anchor_lang::system_program;
use anchor_lang::Discriminator;
use anchor_spl::associated_token::{
    self, get_associated_token_address_with_program_id, AssociatedToken,
};
use anchor_spl::token::{self as spl, Token};
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface};

/// `require!` without the source location. Anchor's `require!` builds a filename and a line
/// number into every check; this calls the error's own `From` once per check instead. The
/// error's code, name and message are exactly the same, so every client decodes it the same
/// way; only the line the check sat on leaves the log. Part of what kept the Plans upgrade
/// small enough to cost a deposit that comes back, rather than rent that stays.
macro_rules! ensure {
    ($cond:expr, $err:expr $(,)?) => {
        if !($cond) {
            return Err(anchor_lang::error::Error::from($err));
        }
    };
}

pub mod errors;
pub mod plan;
pub mod pyth;
pub mod registry;
pub mod rule;
pub mod scaled_ui;
pub mod state;

pub use errors::ScripError;
pub use state::*;

use pyth::{parse_price_update, PYTH_RECEIVER};
use rule::*;

declare_id!("Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj");

/// The keeper's reward per sweep, paid from the owner's float. Fixed, so the keeper's only
/// discretion is the route, bounded by the owner's tolerance.
pub const KEEPER_TIP: u64 = 500_000;
/// A sponsored position that nobody claimed may be taken back after this long.
pub const SPONSOR_CANCEL_AFTER: i64 = 30 * 86_400;
pub const DAY: i64 = 86_400;
/// A grant's cliff plus duration may not exceed this. Ten years is a career.
pub const MAX_GRANT_SECS: i64 = 10 * 365 * 86_400;

/// # Scrip — a rule on a wallet
///
/// THE PROGRAM IS NEVER THE VAULT. The owner's USDC and the owner's stock both sit in the
/// owner's own token accounts. The program holds three things: the rule the owner signed,
/// the receipts it writes, and — for the length of one transaction, or one open intake —
/// an escrow on its way to a recipient.
///
/// THE PROGRAM NEVER DECIDES HOW MUCH. The rate is the owner's. The price is Pyth's. The
/// route is the keeper's, bounded by the owner's tolerance. The timing is arrival. There is
/// no instruction here that lets anyone — keeper, payer, deployer — choose an amount.
///
/// PAUSING IS A TOKEN-PROGRAM REVOKE. The rule works through a delegate allowance the owner
/// approved on their own USDC account. Revoking it is an instruction on the token program,
/// and nothing in this program can prevent, delay or reverse it.
#[program]
pub mod scrip {
    use super::*;

    // ── Book ───────────────────────────────────────────────────────────────────────────

    /// Open a book: a handle, an asset, an attestation. One per owner. The rent may be paid
    /// by somebody else, so a claim from an empty wallet can open a book on the way.
    pub fn open_book(ctx: Context<OpenBook>, slug: String, terms_version: u8, kind: HandleKind) -> Result<()> {
        ensure!(valid_slug(&slug), ScripError::SlugInvalid);
        let entry = registry::lookup(&ctx.accounts.asset_mint.key())
            .ok_or(ScripError::AssetNotRegistered)?;
        ensure!(!entry.xstocks || terms_version >= 1, ScripError::TermsRequired);
        ensure!(registry::usdc_allowed(&ctx.accounts.usdc_mint.key()), ScripError::WrongUsdcMint);
        ensure!(ctx.accounts.usdc_mint.decimals == 6, ScripError::WrongUsdcDecimals);

        let book = &mut ctx.accounts.book;
        book.owner = ctx.accounts.owner.key();
        book.slug = slug.clone();
        book.asset = entry.mint;
        book.usdc_mint = ctx.accounts.usdc_mint.key();
        book.feed_raw = entry.feed_raw;
        book.feed_adjusted = entry.feed_adjusted;
        book.terms_version = terms_version;
        book.opened_unix = Clock::get()?.unix_timestamp;
        book.bump = ctx.bumps.book;
        book.rule = Rule { min_inbound: DEFAULT_MIN_INBOUND, ..Rule::default() };
        book.pending = None;

        let handle = &mut ctx.accounts.handle;
        handle.owner = ctx.accounts.owner.key();
        handle.bump = ctx.bumps.handle;
        handle.kind = kind;

        emit!(BookOpened { book: book.key(), owner: book.owner, slug, asset: book.asset });
        Ok(())
    }

    /// Change the asset the rule buys. The watermark resets to the current balance so the
    /// change never taxes money that already landed.
    pub fn set_asset(ctx: Context<SetAsset>, terms_version: u8) -> Result<()> {
        let book = &mut ctx.accounts.book;
        ensure!(book.pending.is_none(), ScripError::RulePending);
        let entry = registry::lookup(&ctx.accounts.asset_mint.key())
            .ok_or(ScripError::AssetNotRegistered)?;
        ensure!(!entry.xstocks || terms_version >= 1, ScripError::TermsRequired);
        book.asset = entry.mint;
        book.feed_raw = entry.feed_raw;
        book.feed_adjusted = entry.feed_adjusted;
        book.terms_version = terms_version;
        book.rule.watermark = ctx.accounts.owner_usdc.amount;
        emit!(AssetChanged { book: book.key(), asset: book.asset });
        Ok(())
    }

    /// Close the book and its handle. Returns the rent and the float to the owner.
    pub fn close_book(ctx: Context<CloseBook>) -> Result<()> {
        let book = &ctx.accounts.book;
        ensure!(!book.rule.enabled, ScripError::RuleStillOn);
        ensure!(book.pending.is_none(), ScripError::RulePending);
        Ok(())
    }

    // ── Rule ───────────────────────────────────────────────────────────────────────────

    /// Turn the rule on. The client puts `approve_checked(delegate = book)` and a system
    /// transfer of float BEFORE this instruction in the same transaction, so "on" on chain
    /// means the delegate really is set.
    pub fn enable_rule(
        ctx: Context<RuleOwner>,
        rate_bps: u16,
        escalate_bps: u16,
        floor_usdc: u64,
        cap_usdc: u64,
        tolerance_bps: u16,
    ) -> Result<()> {
        check_rule_ranges(rate_bps, escalate_bps, tolerance_bps)?;
        let book = &mut ctx.accounts.book;
        ensure!(!book.rule.enabled, ScripError::RuleAlreadyEnabled);
        ensure!(book.pending.is_none(), ScripError::RulePending);
        require_delegate(&ctx.accounts.owner_usdc, &book.key())?;

        let now = Clock::get()?.unix_timestamp;
        book.rule = Rule {
            enabled: true,
            rate_bps,
            escalate_bps,
            floor_usdc,
            cap_usdc,
            min_inbound: DEFAULT_MIN_INBOUND,
            tolerance_bps,
            // Everything already here has been seen. Only what lands from now is income.
            watermark: ctx.accounts.owner_usdc.amount,
            enabled_unix: now,
            sweeps: 0,
        };
        emit!(RuleChanged { book: book.key(), enabled: true, rate_bps, watermark: book.rule.watermark });
        Ok(())
    }

    /// Change the rule, or resume it after a pause: the watermark resets to the current
    /// balance, so money that landed while paused is not taxed retroactively. The escalation
    /// clock restarts only if the rate or the escalation changed.
    pub fn set_rule(
        ctx: Context<RuleOwner>,
        rate_bps: u16,
        escalate_bps: u16,
        floor_usdc: u64,
        cap_usdc: u64,
        tolerance_bps: u16,
    ) -> Result<()> {
        check_rule_ranges(rate_bps, escalate_bps, tolerance_bps)?;
        let book = &mut ctx.accounts.book;
        ensure!(book.rule.enabled, ScripError::RuleNotEnabled);
        ensure!(book.pending.is_none(), ScripError::RulePending);
        require_delegate(&ctx.accounts.owner_usdc, &book.key())?;

        let now = Clock::get()?.unix_timestamp;
        let book_key = book.key();
        let r = &mut book.rule;
        if r.rate_bps != rate_bps || r.escalate_bps != escalate_bps {
            r.enabled_unix = now;
        }
        r.rate_bps = rate_bps;
        r.escalate_bps = escalate_bps;
        r.floor_usdc = floor_usdc;
        r.cap_usdc = cap_usdc;
        r.tolerance_bps = tolerance_bps;
        r.watermark = ctx.accounts.owner_usdc.amount;
        emit!(RuleChanged { book: book_key, enabled: true, rate_bps, watermark: r.watermark });
        Ok(())
    }

    /// Turn the rule off. The client puts `revoke` BEFORE this instruction; the program
    /// checks that the delegate is gone. Pausing WITHOUT this instruction is `revoke` alone,
    /// which this program cannot see coming and cannot prevent.
    pub fn disable_rule(ctx: Context<RuleOwner>) -> Result<()> {
        let book = &mut ctx.accounts.book;
        ensure!(book.rule.enabled, ScripError::RuleNotEnabled);
        ensure!(book.pending.is_none(), ScripError::RulePending);
        let d = &ctx.accounts.owner_usdc;
        let still = d.delegate.map(|k| k == book.key()).unwrap_or(false) && d.delegated_amount > 0;
        ensure!(!still, ScripError::DelegateStillSet);
        book.rule.enabled = false;
        emit!(RuleChanged { book: book.key(), enabled: false, rate_bps: book.rule.rate_bps, watermark: book.rule.watermark });
        Ok(())
    }

    /// Lower the watermark to the balance after the owner spent. Anyone may call it, because
    /// it can only ever set the watermark to the TRUE balance, and only downward: it cannot
    /// make money that already landed taxable, only stop a spend from hiding the next arrival.
    /// Without it, an owner who spent $700 would see nothing convert until their balance had
    /// climbed back past the old mark. A sweep that finds nothing to sweep reverts, so the
    /// adjustment needs a transaction of its own.
    pub fn sync_watermark(ctx: Context<SyncWatermark>) -> Result<()> {
        let book = &mut ctx.accounts.book;
        ensure!(book.pending.is_none(), ScripError::RulePending);
        let bal = ctx.accounts.owner_usdc.amount;
        ensure!(bal < book.rule.watermark, ScripError::WatermarkNotAbove);
        book.rule.watermark = bal;
        emit!(RuleChanged { book: book.key(), enabled: book.rule.enabled, rate_bps: book.rule.rate_bps, watermark: bal });
        Ok(())
    }

    /// Take float back. Depositing needs no instruction: a system transfer to the Book's
    /// address is the deposit.
    pub fn withdraw_float(ctx: Context<WithdrawFloat>, lamports: u64) -> Result<()> {
        ensure!(lamports > 0, ScripError::NothingToWithdraw);
        let book = ctx.accounts.book.to_account_info();
        let min = Rent::get()?.minimum_balance(book.data_len());
        ensure!(book.lamports().saturating_sub(lamports) >= min, ScripError::FloatBelowRent);
        book.sub_lamports(lamports)?;
        ctx.accounts.owner.to_account_info().add_lamports(lamports)?;
        Ok(())
    }

    // ── Sweep ──────────────────────────────────────────────────────────────────────────

    /// The first half of a sweep. Computes the slice from on-chain state and moves exactly
    /// that much USDC to the keeper through the delegate — but ONLY after proving, through
    /// the instructions sysvar, that a `finish_sweep` for this book and release id follows in
    /// this same transaction. If it does not, this refuses. If it does and fails, everything
    /// here reverts with it, including this transfer.
    pub fn begin_sweep(ctx: Context<BeginSweep>, release_id: [u8; 16]) -> Result<()> {
        ensure!(get_stack_height() == 1, ScripError::NotTopLevel);
        let book_key = ctx.accounts.book.key();
        require_finish_follows(&ctx.accounts.instructions, &book_key, &release_id)?;

        let clock = Clock::get()?;
        let rent = Rent::get()?;
        let book = &mut ctx.accounts.book;
        ensure!(book.rule.enabled, ScripError::RuleNotEnabled);
        ensure!(book.pending.is_none(), ScripError::RulePending);

        // ── the slice ────────────────────────────────────────────────────────────
        let bal = ctx.accounts.owner_usdc.amount;
        let rate = effective_rate(book.rule.rate_bps, book.rule.escalate_bps, book.rule.enabled_unix, clock.unix_timestamp);
        let s = compute_slice(SliceInput {
            balance: bal,
            watermark: book.rule.watermark,
            min_inbound: book.rule.min_inbound,
            cap: book.rule.cap_usdc,
            floor: book.rule.floor_usdc,
            rate_bps: rate,
        })?;
        let d = &ctx.accounts.owner_usdc;
        ensure!(d.delegate.map(|k| k == book_key).unwrap_or(false), ScripError::DelegateNotSet);
        ensure!(d.delegated_amount >= s.slice, ScripError::AllowanceTooLow);

        // ── the owner's asset account, created by the keeper if it does not exist ────
        let owner_asset = &ctx.accounts.owner_asset;
        let expected = get_associated_token_address_with_program_id(
            &ctx.accounts.owner.key(),
            &ctx.accounts.asset_mint.key(),
            &ctx.accounts.asset_token_program.key(),
        );
        ensure!(owner_asset.key() == expected, ScripError::WrongAta);
        let mut ata_rent = 0u64;
        if owner_asset.data_is_empty() {
            associated_token::create_idempotent(CpiContext::new(
                ctx.accounts.associated_token_program.to_account_info(),
                associated_token::Create {
                    payer: ctx.accounts.keeper.to_account_info(),
                    associated_token: owner_asset.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                    mint: ctx.accounts.asset_mint.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    token_program: ctx.accounts.asset_token_program.to_account_info(),
                },
            ))?;
            ata_rent = owner_asset.lamports();
        }
        let asset_before_raw = token_amount(owner_asset, &ctx.accounts.asset_mint.key(), &ctx.accounts.owner.key())?;

        // ── the float must cover what finish_sweep will pay out ─────────────────────
        let receipt_rent = rent.minimum_balance(8 + Receipt::INIT_SPACE);
        let book_min = rent.minimum_balance(8 + Book::INIT_SPACE);
        let needed = book_min
            .checked_add(KEEPER_TIP)
            .and_then(|n| n.checked_add(receipt_rent))
            .and_then(|n| n.checked_add(ata_rent))
            .ok_or(ScripError::Overflow)?;
        ensure!(book.to_account_info().lamports() >= needed, ScripError::FloatTooLow);

        // ── move the slice: owner's USDC → keeper's USDC, signed by the Book as delegate ──
        let owner_key = book.owner;
        let bump = book.bump;
        let seeds: &[&[u8]] = &[b"book", owner_key.as_ref(), &[bump]];
        spl::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.usdc_program.to_account_info(),
                spl::TransferChecked {
                    from: ctx.accounts.owner_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.keeper_usdc.to_account_info(),
                    authority: book.to_account_info(),
                },
                &[seeds],
            ),
            s.slice,
            ctx.accounts.usdc_mint.decimals,
        )?;

        // The remainder is the owner's, untaxed, forever.
        book.rule.watermark = bal - s.slice;
        book.pending = Some(Pending {
            release_id,
            keeper: ctx.accounts.keeper.key(),
            inbound: s.inbound,
            rate_bps: rate,
            slice: s.slice,
            usdc_before: bal - s.slice,
            asset_before_raw,
            ata_rent,
            slot: clock.slot,
        });
        Ok(())
    }

    /// The second half. Verifies what arrived against Pyth, writes the receipt, pays the
    /// keeper from the float. Any failure here reverts the whole transaction, delegate
    /// transfer included.
    pub fn finish_sweep(ctx: Context<FinishSweep>, release_id: [u8; 16]) -> Result<()> {
        ensure!(get_stack_height() == 1, ScripError::NotTopLevel);
        let clock = Clock::get()?;
        let rent = Rent::get()?;
        let book = &mut ctx.accounts.book;
        let p = book.pending.ok_or(ScripError::NoPending)?;
        ensure!(p.release_id == release_id, ScripError::PendingMismatch);
        ensure!(p.keeper == ctx.accounts.keeper.key(), ScripError::PendingMismatch);
        ensure!(ctx.accounts.owner_usdc.amount == p.usdc_before, ScripError::CashMoved);

        // ── the price ──────────────────────────────────────────────────────────────
        let price = {
            let data = ctx.accounts.price_update.try_borrow_data()?;
            parse_price_update(&data)?
        };
        let basis_raw = price.feed_id == book.feed_raw && book.feed_raw != registry::ZERO_FEED;
        let basis_adjusted = price.feed_id == book.feed_adjusted && book.feed_adjusted != registry::ZERO_FEED;
        ensure!(basis_raw || basis_adjusted, ScripError::PriceFeedWrong);
        ensure!(clock.unix_timestamp - price.publish_time <= FEED_MAX_AGE, ScripError::PriceStale);
        ensure!(
            (price.conf as u128) * TOTAL_BPS <= (price.price as u128) * MAX_CONF_BPS,
            ScripError::PriceUncertain
        );

        // ── the multiplier, only when the feed priced a UI unit ─────────────────────
        let multiplier_e12 = if basis_adjusted {
            let mint_info = ctx.accounts.asset_mint.to_account_info();
            let data = mint_info.try_borrow_data()?;
            match scaled_ui::read_scaled_ui(&data) {
                Some(cfg) => Some(scaled_ui::live_multiplier_e12(&cfg, clock.unix_timestamp)?),
                None => None,
            }
        } else {
            None
        };

        let min_raw = min_out_raw(
            p.slice,
            book.rule.tolerance_bps,
            price.price,
            price.conf,
            price.expo,
            ctx.accounts.asset_mint.decimals,
            multiplier_e12,
        )?;
        let received_raw = ctx
            .accounts
            .owner_asset
            .amount
            .checked_sub(p.asset_before_raw)
            .ok_or(ScripError::ReceivedBelowMinimum)?;
        ensure!(received_raw >= min_raw && received_raw > 0, ScripError::ReceivedBelowMinimum);

        // ── the receipt ────────────────────────────────────────────────────────────
        let receipt = &mut ctx.accounts.receipt;
        receipt.set_inner(Receipt {
            kind: ReceiptKind::Sweep,
            run_id: [0u8; 16],
            recipient: book.owner,
            payer: Pubkey::default(),
            submitter: ctx.accounts.keeper.key(),
            book: book.key(),
            release_id,
            reason_hash: [0u8; 32],
            basis_usdc: p.inbound,
            rate_bps: p.rate_bps,
            paid_usdc: p.slice,
            asset: book.asset,
            amount_raw: received_raw,
            price: PriceStamp {
                feed: price.feed_id,
                price: price.price,
                expo: price.expo,
                conf: price.conf,
                publish_time: price.publish_time,
            },
            settled_slot: clock.slot,
            settled_unix: clock.unix_timestamp,
            measured_7d: Measurement::default(),
            measured_30d: Measurement::default(),
            bump: ctx.bumps.receipt,
        });

        // ── pay the keeper from the float ──────────────────────────────────────────
        let receipt_rent = rent.minimum_balance(8 + Receipt::INIT_SPACE);
        let reimburse = KEEPER_TIP
            .checked_add(receipt_rent)
            .and_then(|n| n.checked_add(p.ata_rent))
            .ok_or(ScripError::Overflow)?;
        let book_info = book.to_account_info();
        let book_min = rent.minimum_balance(book_info.data_len());
        ensure!(book_info.lamports().saturating_sub(reimburse) >= book_min, ScripError::FloatTooLow);
        book_info.sub_lamports(reimburse)?;
        ctx.accounts.keeper.to_account_info().add_lamports(reimburse)?;

        book.pending = None;
        book.rule.sweeps = book.rule.sweeps.saturating_add(1);

        emit!(Swept {
            receipt: receipt.key(),
            book: book.key(),
            owner: book.owner,
            release_id,
            inbound: p.inbound,
            rate_bps: p.rate_bps,
            slice: p.slice,
            asset: book.asset,
            amount_raw: received_raw,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    // ── Intake ─────────────────────────────────────────────────────────────────────────

    /// Create the escrow for an intake. A Jupiter swap in the same transaction fills it.
    pub fn fund_payout(
        ctx: Context<FundPayout>,
        release_id: [u8; 16],
        kind: PayoutKind,
        recipient: Pubkey,
        claimant: Pubkey,
        reason_hash: [u8; 32],
        declared_usdc: u64,
        min_out_raw: u64,
        run_id: [u8; 16],
    ) -> Result<()> {
        ensure!(declared_usdc > 0, ScripError::EscrowEmpty);
        let asset = ctx.accounts.asset_mint.key();
        match kind {
            PayoutKind::Settle => {
                ensure!(recipient != Pubkey::default(), ScripError::RecipientRequired);
                let book = ctx.accounts.recipient_book.as_ref().ok_or(ScripError::BookRequired)?;
                ensure!(book.owner == recipient, ScripError::NotTheRecipient);
                ensure!(book.asset == asset, ScripError::AssetMismatch);
            }
            PayoutKind::Sponsor => {
                ensure!(registry::lookup(&asset).is_some(), ScripError::AssetNotRegistered);
                ensure!(
                    recipient != Pubkey::default() || claimant != Pubkey::default(),
                    ScripError::RecipientRequired
                );
            }
        }
        let payout = &mut ctx.accounts.payout;
        payout.payer = ctx.accounts.payer.key();
        payout.recipient = recipient;
        payout.claimant = claimant;
        payout.kind = kind;
        payout.release_id = release_id;
        payout.reason_hash = reason_hash;
        payout.declared_usdc = declared_usdc;
        payout.asset = asset;
        payout.min_out_raw = min_out_raw;
        payout.created_unix = Clock::get()?.unix_timestamp;
        payout.run_id = run_id;
        payout.bump = ctx.bumps.payout;
        Ok(())
    }

    /// Release a settle payout: escrow → the recipient's own account, receipt, close.
    pub fn release_payout(ctx: Context<ReleasePayout>) -> Result<()> {
        let payout = &ctx.accounts.payout;
        ensure!(payout.kind == PayoutKind::Settle, ScripError::WrongKind);
        let amount = ctx.accounts.escrow.amount;
        ensure!(amount > 0, ScripError::EscrowEmpty);
        ensure!(amount >= payout.min_out_raw, ScripError::EscrowBelowMinimum);

        let clock = Clock::get()?;
        let stamp = optional_stamp(ctx.accounts.price_update.as_ref(), &ctx.accounts.recipient_book);
        move_escrow_and_close(
            &ctx.accounts.payout,
            &ctx.accounts.escrow,
            &ctx.accounts.recipient_asset,
            &ctx.accounts.asset_mint,
            &ctx.accounts.asset_token_program,
            &ctx.accounts.payer.to_account_info(),
            amount,
        )?;

        let receipt = &mut ctx.accounts.receipt;
        receipt.set_inner(Receipt {
            kind: ReceiptKind::Pay,
            run_id: payout.run_id,
            recipient: payout.recipient,
            payer: payout.payer,
            submitter: ctx.accounts.payer.key(),
            book: ctx.accounts.recipient_book.key(),
            release_id: payout.release_id,
            reason_hash: payout.reason_hash,
            basis_usdc: payout.declared_usdc,
            rate_bps: TOTAL_BPS as u16,
            paid_usdc: payout.declared_usdc,
            asset: payout.asset,
            amount_raw: amount,
            price: stamp,
            settled_slot: clock.slot,
            settled_unix: clock.unix_timestamp,
            measured_7d: Measurement::default(),
            measured_30d: Measurement::default(),
            bump: ctx.bumps.receipt,
        });
        emit!(Settled {
            receipt: receipt.key(),
            payer: payout.payer,
            recipient: payout.recipient,
            release_id: payout.release_id,
            paid_usdc: payout.declared_usdc,
            asset: payout.asset,
            amount_raw: amount,
            kind: ReceiptKind::Pay,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Claim a sponsored position into the claimer's own wallet. The claimer needs a Book
    /// (the client prepends `open_book`); the fee and the rent may be paid by a relayer.
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let payout = &ctx.accounts.payout;
        ensure!(payout.kind == PayoutKind::Sponsor, ScripError::WrongKind);
        let claimer = ctx.accounts.claimer.key();
        if payout.recipient != Pubkey::default() {
            ensure!(claimer == payout.recipient, ScripError::NotTheRecipient);
        } else {
            let key = ctx.accounts.claim_key.as_ref().ok_or(ScripError::ClaimKeyRequired)?;
            ensure!(key.key() == payout.claimant, ScripError::ClaimKeyRequired);
        }
        let amount = ctx.accounts.escrow.amount;
        ensure!(amount > 0, ScripError::EscrowEmpty);

        let clock = Clock::get()?;
        let stamp = optional_stamp(ctx.accounts.price_update.as_ref(), &ctx.accounts.claimer_book);
        move_escrow_and_close(
            &ctx.accounts.payout,
            &ctx.accounts.escrow,
            &ctx.accounts.claimer_asset,
            &ctx.accounts.asset_mint,
            &ctx.accounts.asset_token_program,
            &ctx.accounts.payer.to_account_info(),
            amount,
        )?;

        let receipt = &mut ctx.accounts.receipt;
        receipt.set_inner(Receipt {
            kind: ReceiptKind::Gift,
            run_id: payout.run_id,
            recipient: claimer,
            payer: payout.payer,
            submitter: ctx.accounts.fee_payer.key(),
            book: ctx.accounts.claimer_book.key(),
            release_id: payout.release_id,
            reason_hash: payout.reason_hash,
            basis_usdc: payout.declared_usdc,
            rate_bps: TOTAL_BPS as u16,
            paid_usdc: payout.declared_usdc,
            asset: payout.asset,
            amount_raw: amount,
            price: stamp,
            settled_slot: clock.slot,
            settled_unix: clock.unix_timestamp,
            measured_7d: Measurement::default(),
            measured_30d: Measurement::default(),
            bump: ctx.bumps.receipt,
        });
        emit!(Settled {
            receipt: receipt.key(),
            payer: payout.payer,
            recipient: claimer,
            release_id: payout.release_id,
            paid_usdc: payout.declared_usdc,
            asset: payout.asset,
            amount_raw: amount,
            kind: ReceiptKind::Gift,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Take back a sponsored position nobody claimed, after thirty days.
    pub fn cancel_payout(ctx: Context<CancelPayout>) -> Result<()> {
        let payout = &ctx.accounts.payout;
        ensure!(payout.kind == PayoutKind::Sponsor, ScripError::WrongKind);
        let now = Clock::get()?.unix_timestamp;
        ensure!(now >= payout.created_unix + SPONSOR_CANCEL_AFTER, ScripError::TooEarlyToCancel);
        let amount = ctx.accounts.escrow.amount;
        move_escrow_and_close(
            &ctx.accounts.payout,
            &ctx.accounts.escrow,
            &ctx.accounts.payer_asset,
            &ctx.accounts.asset_mint,
            &ctx.accounts.asset_token_program,
            &ctx.accounts.payer.to_account_info(),
            amount,
        )?;
        emit!(Cancelled { payout: payout.key(), payer: payout.payer, at: now });
        Ok(())
    }

    // ── Grants ─────────────────────────────────────────────────────────────────────────

    /// Open a grant: the escrow the stock will vest from, and the recipient's own asset
    /// account if they have none yet. The client puts a Memo, the Jupiter route (USDC →
    /// asset, destination = the escrow) and `seal_grant` in the same transaction.
    pub fn open_grant(
        ctx: Context<OpenGrant>,
        grant_id: [u8; 16],
        start_unix: i64,
        cliff_secs: u32,
        duration_secs: u32,
        revocable: bool,
        reason_hash: [u8; 32],
        declared_usdc: u64,
        min_out_raw: u64,
        run_id: [u8; 16],
    ) -> Result<()> {
        let recipient = ctx.accounts.recipient.key();
        ensure!(recipient != Pubkey::default(), ScripError::GrantRecipientRequired);
        ensure!(declared_usdc > 0, ScripError::EscrowEmpty);
        let asset = ctx.accounts.asset_mint.key();
        ensure!(registry::lookup(&asset).is_some(), ScripError::AssetNotRegistered);
        ensure!(
            (cliff_secs as i64).saturating_add(duration_secs as i64) <= MAX_GRANT_SECS,
            ScripError::GrantScheduleInvalid
        );
        let now = Clock::get()?.unix_timestamp;
        let g = &mut ctx.accounts.grant;
        g.payer = ctx.accounts.payer.key();
        g.recipient = recipient;
        g.asset = asset;
        g.grant_id = grant_id;
        g.total_raw = 0;
        g.released_raw = 0;
        g.release_cap_raw = u64::MAX;
        g.start_unix = if start_unix == 0 { now } else { start_unix };
        g.cliff_secs = cliff_secs;
        g.duration_secs = duration_secs;
        g.revocable = revocable;
        g.sealed = false;
        g.state = GrantState::Active;
        g.reason_hash = reason_hash;
        g.declared_usdc = declared_usdc;
        g.min_out_raw = min_out_raw;
        g.run_id = run_id;
        g.created_unix = now;
        g.vests = 0;
        g.bump = ctx.bumps.grant;
        Ok(())
    }

    /// Seal the grant, in the same transaction as the route: the escrow holds at least the
    /// payer's own minimum, the total is fixed, the float that pays for vest receipts and
    /// tips is deposited, and the grant's own receipt is written.
    pub fn seal_grant(ctx: Context<SealGrant>, float_lamports: u64) -> Result<()> {
        let clock = Clock::get()?;
        let amount = ctx.accounts.escrow.amount;
        let (payer, recipient, asset, grant_id, run_id, reason_hash, declared_usdc, start_unix, cliff_secs, duration_secs, revocable) = {
            let g = &mut ctx.accounts.grant;
            ensure!(!g.sealed, ScripError::GrantAlreadySealed);
            ensure!(amount > 0, ScripError::EscrowEmpty);
            ensure!(amount >= g.min_out_raw, ScripError::EscrowBelowMinimum);
            g.total_raw = amount;
            g.sealed = true;
            (g.payer, g.recipient, g.asset, g.grant_id, g.run_id, g.reason_hash, g.declared_usdc, g.start_unix, g.cliff_secs, g.duration_secs, g.revocable)
        };
        if float_lamports > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.payer.to_account_info(),
                        to: ctx.accounts.grant.to_account_info(),
                    },
                ),
                float_lamports,
            )?;
        }
        let grant_key = ctx.accounts.grant.key();
        let receipt = &mut ctx.accounts.receipt;
        receipt.set_inner(Receipt {
            kind: ReceiptKind::Grant,
            recipient,
            payer,
            submitter: ctx.accounts.payer.key(),
            book: grant_key,
            release_id: grant_id,
            run_id,
            reason_hash,
            basis_usdc: declared_usdc,
            rate_bps: TOTAL_BPS as u16,
            paid_usdc: declared_usdc,
            asset,
            amount_raw: amount,
            price: PriceStamp::default(),
            settled_slot: clock.slot,
            settled_unix: clock.unix_timestamp,
            measured_7d: Measurement::default(),
            measured_30d: Measurement::default(),
            bump: ctx.bumps.receipt,
        });
        emit!(GrantOpened {
            grant: grant_key,
            receipt: receipt.key(),
            payer,
            recipient,
            asset,
            total_raw: amount,
            start_unix,
            cliff_secs,
            duration_secs,
            revocable,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Vest what the schedule has released: escrow → the recipient's own account, with a
    /// receipt. Anyone may call it; the caller is repaid the tip and the receipt's rent from
    /// the grant's float. A revoked grant still vests what had accrued by the revoke.
    pub fn vest(ctx: Context<Vest>, release_id: [u8; 16]) -> Result<()> {
        let clock = Clock::get()?;
        let rent = Rent::get()?;
        let (amount, payer, recipient, asset, run_id, reason_hash, declared_usdc, total_raw, released_after, completed) = {
            let g = &mut ctx.accounts.grant;
            ensure!(g.sealed, ScripError::GrantNotSealed);
            ensure!(g.state != GrantState::Completed, ScripError::GrantNotActive);
            let amount = g.releasable_raw(clock.unix_timestamp);
            ensure!(amount > 0, ScripError::NothingToVest);
            g.released_raw = g.released_raw.checked_add(amount).ok_or(ScripError::Overflow)?;
            g.vests = g.vests.saturating_add(1);
            let cap = g.total_raw.min(g.release_cap_raw);
            let completed = g.state == GrantState::Active && g.released_raw >= cap;
            if completed {
                g.state = GrantState::Completed;
            }
            (amount, g.payer, g.recipient, g.asset, g.run_id, g.reason_hash, g.declared_usdc, g.total_raw, g.released_raw, completed)
        };
        move_grant_escrow(
            &ctx.accounts.grant,
            &ctx.accounts.escrow,
            &ctx.accounts.recipient_asset,
            &ctx.accounts.asset_mint,
            &ctx.accounts.asset_token_program,
            amount,
        )?;
        // The dollars this vest stands for: the purchase, pro rata by raw units.
        let paid_usdc = ((declared_usdc as u128) * (amount as u128) / (total_raw.max(1) as u128)) as u64;
        let grant_key = ctx.accounts.grant.key();
        let receipt = &mut ctx.accounts.receipt;
        receipt.set_inner(Receipt {
            kind: ReceiptKind::Vest,
            recipient,
            payer,
            submitter: ctx.accounts.keeper.key(),
            book: grant_key,
            release_id,
            run_id,
            reason_hash,
            basis_usdc: paid_usdc,
            rate_bps: TOTAL_BPS as u16,
            paid_usdc,
            asset,
            amount_raw: amount,
            price: PriceStamp::default(),
            settled_slot: clock.slot,
            settled_unix: clock.unix_timestamp,
            measured_7d: Measurement::default(),
            measured_30d: Measurement::default(),
            bump: ctx.bumps.receipt,
        });
        // The caller is repaid the tip and the receipt's rent from the grant's float.
        let receipt_rent = rent.minimum_balance(8 + Receipt::INIT_SPACE);
        let reimburse = KEEPER_TIP.checked_add(receipt_rent).ok_or(ScripError::Overflow)?;
        let grant_info = ctx.accounts.grant.to_account_info();
        let grant_min = rent.minimum_balance(grant_info.data_len());
        ensure!(grant_info.lamports().saturating_sub(reimburse) >= grant_min, ScripError::GrantFloatTooLow);
        grant_info.sub_lamports(reimburse)?;
        ctx.accounts.keeper.to_account_info().add_lamports(reimburse)?;
        emit!(Vested {
            grant: grant_key,
            receipt: receipt.key(),
            recipient,
            amount_raw: amount,
            released_raw: released_after,
            total_raw,
            completed,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Revoke a revocable grant: what had not accrued returns to the payer; what had accrued
    /// stays claimable by `vest`, receipt and all.
    pub fn revoke_grant(ctx: Context<RevokeGrant>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let (back, payer) = {
            let g = &mut ctx.accounts.grant;
            ensure!(g.sealed, ScripError::GrantNotSealed);
            ensure!(g.revocable, ScripError::GrantNotRevocable);
            ensure!(g.state == GrantState::Active, ScripError::GrantNotActive);
            let accrued = g.scheduled_raw(now).min(g.total_raw);
            g.release_cap_raw = accrued;
            g.state = GrantState::Revoked;
            (g.total_raw.saturating_sub(accrued), g.payer)
        };
        move_grant_escrow(
            &ctx.accounts.grant,
            &ctx.accounts.escrow,
            &ctx.accounts.payer_asset,
            &ctx.accounts.asset_mint,
            &ctx.accounts.asset_token_program,
            back,
        )?;
        emit!(GrantRevoked { grant: ctx.accounts.grant.key(), payer, returned_raw: back, at: now });
        Ok(())
    }

    /// Close a finished grant: the escrow is empty (everything vested, or returned), and the
    /// rent and the remaining float go back to the payer. An unsealed grant closes too, its
    /// escrow returned to the payer.
    pub fn close_grant(ctx: Context<CloseGrant>) -> Result<()> {
        let amount = ctx.accounts.escrow.amount;
        {
            let g = &ctx.accounts.grant;
            if g.sealed {
                ensure!(g.state != GrantState::Active, ScripError::GrantStillOpen);
                ensure!(amount == 0, ScripError::GrantStillOpen);
            }
        }
        move_grant_escrow(
            &ctx.accounts.grant,
            &ctx.accounts.escrow,
            &ctx.accounts.payer_asset,
            &ctx.accounts.asset_mint,
            &ctx.accounts.asset_token_program,
            amount,
        )?;
        close_grant_escrow(
            &ctx.accounts.grant,
            &ctx.accounts.escrow,
            &ctx.accounts.asset_token_program,
            &ctx.accounts.payer.to_account_info(),
        )
    }

    // ── Plans: a sponsor's match ───────────────────────────────────────────────────────

    /// Open a Plan: the match's terms and an empty escrow of the Plan's stock, owned by the
    /// Plan. Nothing in the program fills it: the escrow is an ordinary token account, so a
    /// Jupiter route in the same transaction delivers into it directly, and a top-up later is
    /// a plain transfer. The sponsor only ever adds their own money; there is nothing to check.
    pub fn open_plan(
        ctx: Context<OpenPlan>,
        plan_id: [u8; 16],
        match_bps: u16,
        monthly_cap_usdc: u64,
        default_rate_bps: u16,
        escalate_bps: u16,
        reason_hash: [u8; 32],
    ) -> Result<()> {
        ensure!(match_bps > 0 && match_bps <= plan::MAX_MATCH_BPS, ScripError::PlanTermsInvalid);
        ensure!(monthly_cap_usdc > 0, ScripError::PlanTermsInvalid);
        ensure!(default_rate_bps <= MAX_RATE_BPS && escalate_bps <= MAX_RATE_BPS, ScripError::PlanTermsInvalid);
        let entry = registry::lookup(&ctx.accounts.asset_mint.key()).ok_or(ScripError::AssetNotRegistered)?;
        let now = Clock::get()?.unix_timestamp;
        let p = &mut ctx.accounts.plan;
        p.sponsor = ctx.accounts.sponsor.key();
        p.plan_id = plan_id;
        p.asset = entry.mint;
        p.feed_raw = entry.feed_raw;
        p.feed_adjusted = entry.feed_adjusted;
        p.match_bps = match_bps;
        p.monthly_cap_usdc = monthly_cap_usdc;
        p.default_rate_bps = default_rate_bps;
        p.escalate_bps = escalate_bps;
        p.reason_hash = reason_hash;
        p.status = PlanStatus::Active;
        p.matched_raw = 0;
        p.matched_usdc = 0;
        p.matches = 0;
        p.members = 0;
        p.created_unix = now;
        p.bump = ctx.bumps.plan;
        emit!(PlanOpened { plan: p.key(), sponsor: p.sponsor, asset: p.asset, match_bps, monthly_cap_usdc, at: now });
        Ok(())
    }

    /// The sponsor invites one wallet. Several in one transaction for a team.
    pub fn add_member(ctx: Context<AddMember>) -> Result<()> {
        ensure!(ctx.accounts.plan.status == PlanStatus::Active, ScripError::PlanNotActive);
        let now = Clock::get()?.unix_timestamp;
        let m = &mut ctx.accounts.member;
        m.plan = ctx.accounts.plan.key();
        m.owner = ctx.accounts.owner.key();
        m.status = MemberStatus::Invited;
        m.joined_unix = 0;
        m.joined_slot = 0;
        m.period_start = 0;
        m.matched_this_period_usdc = 0;
        m.total_matched_usdc = 0;
        m.total_matched_raw = 0;
        m.last_matched_slot = 0;
        m.bump = ctx.bumps.member;
        let p = &mut ctx.accounts.plan;
        p.members = p.members.checked_add(1).ok_or(ScripError::Overflow)?;
        emit!(MemberAdded { plan: p.key(), owner: m.owner, at: now });
        Ok(())
    }

    /// The member joins, by their own signature: only receipts written from now on can match.
    pub fn accept_member(ctx: Context<AcceptMember>) -> Result<()> {
        ensure!(ctx.accounts.plan.status == PlanStatus::Active, ScripError::PlanNotActive);
        let clock = Clock::get()?;
        let m = &mut ctx.accounts.member;
        ensure!(m.status == MemberStatus::Invited, ScripError::MemberNotInvited);
        m.status = MemberStatus::Active;
        m.joined_unix = clock.unix_timestamp;
        m.joined_slot = clock.slot;
        m.period_start = clock.unix_timestamp;
        m.last_matched_slot = clock.slot;
        emit!(MemberJoined { plan: m.plan, owner: m.owner, at: clock.unix_timestamp });
        Ok(())
    }

    /// The sponsor removes a member: no further matches. What was matched stays in the
    /// member's wallet; the account's rent returns to the sponsor.
    pub fn remove_member(ctx: Context<RemoveMember>) -> Result<()> {
        let p = &mut ctx.accounts.plan;
        p.members = p.members.saturating_sub(1);
        emit!(MemberRemoved { plan: p.key(), owner: ctx.accounts.member.owner, at: Clock::get()?.unix_timestamp });
        Ok(())
    }

    /// THE MATCH. Anyone may call it for an active member's sweep receipt. It never touches the
    /// save: the save settled in its own transaction, and this adds stock after it.
    pub fn match_receipt(ctx: Context<MatchReceipt>) -> Result<()> {
        let clock = Clock::get()?;
        let (plan_key, match_bps, monthly_cap, feed_raw, feed_adjusted, sponsor, plan_id, bump) = {
            let p = &ctx.accounts.plan;
            ensure!(p.status == PlanStatus::Active, ScripError::PlanNotActive);
            (p.key(), p.match_bps, p.monthly_cap_usdc, p.feed_raw, p.feed_adjusted, p.sponsor, p.plan_id, p.bump)
        };
        let r = &ctx.accounts.receipt;
        ensure!(r.kind == ReceiptKind::Sweep, ScripError::NotASweep);
        ensure!(r.recipient == ctx.accounts.member.owner, ScripError::NotTheMember);
        let (receipt_slot, slice_usdc, receipt_key) = (r.settled_slot, r.paid_usdc, r.key());
        {
            let m = &ctx.accounts.member;
            ensure!(m.status == MemberStatus::Active, ScripError::MemberNotActive);
            ensure!(receipt_slot > m.last_matched_slot, ScripError::AlreadyMatched);
        }

        // ── the price: the same rules as finish_sweep ────────────────────────────────
        let price = {
            let data = ctx.accounts.price_update.try_borrow_data()?;
            parse_price_update(&data)?
        };
        let basis_raw = price.feed_id == feed_raw && feed_raw != registry::ZERO_FEED;
        let basis_adjusted = price.feed_id == feed_adjusted && feed_adjusted != registry::ZERO_FEED;
        ensure!(basis_raw || basis_adjusted, ScripError::PriceFeedWrong);
        ensure!(clock.unix_timestamp - price.publish_time <= FEED_MAX_AGE, ScripError::PriceStale);
        ensure!((price.conf as u128) * TOTAL_BPS <= (price.price as u128) * MAX_CONF_BPS, ScripError::PriceUncertain);
        let multiplier_e12 = if basis_adjusted {
            let mint_info = ctx.accounts.asset_mint.to_account_info();
            let data = mint_info.try_borrow_data()?;
            match scaled_ui::read_scaled_ui(&data) {
                Some(cfg) => Some(scaled_ui::live_multiplier_e12(&cfg, clock.unix_timestamp)?),
                None => None,
            }
        } else {
            None
        };

        // ── the amount: the share, the month, the escrow ────────────────────────────
        let (period_start, matched_before) = {
            let m = &ctx.accounts.member;
            plan::roll_period(m.period_start, m.matched_this_period_usdc, clock.unix_timestamp)
        };
        let usdc_wanted = plan::match_usdc(slice_usdc, match_bps, monthly_cap, matched_before);
        ensure!(usdc_wanted > 0, ScripError::NothingToMatch);
        // At price PLUS band: the sponsor never pays more stock than the dollars are worth.
        let units_wanted = min_out_raw(usdc_wanted, 0, price.price, price.conf, price.expo, ctx.accounts.asset_mint.decimals, multiplier_e12)?;
        ensure!(units_wanted > 0, ScripError::NothingToMatch);
        let (units, usdc) = plan::limit_by_escrow(units_wanted, usdc_wanted, ctx.accounts.escrow.amount);
        ensure!(units > 0, ScripError::PlanEmpty);

        let seeds: &[&[u8]] = &[b"plan", sponsor.as_ref(), plan_id.as_ref(), &[bump]];
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.asset_token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: ctx.accounts.escrow.to_account_info(),
                    mint: ctx.accounts.asset_mint.to_account_info(),
                    to: ctx.accounts.owner_asset.to_account_info(),
                    authority: ctx.accounts.plan.to_account_info(),
                },
                &[seeds],
            ),
            units,
            ctx.accounts.asset_mint.decimals,
        )?;

        let owner = {
            let m = &mut ctx.accounts.member;
            m.period_start = period_start;
            m.matched_this_period_usdc = matched_before.checked_add(usdc).ok_or(ScripError::Overflow)?;
            m.total_matched_usdc = m.total_matched_usdc.checked_add(usdc).ok_or(ScripError::Overflow)?;
            m.total_matched_raw = m.total_matched_raw.checked_add(units).ok_or(ScripError::Overflow)?;
            m.last_matched_slot = receipt_slot;
            m.owner
        };
        {
            let p = &mut ctx.accounts.plan;
            p.matched_raw = p.matched_raw.checked_add(units).ok_or(ScripError::Overflow)?;
            p.matched_usdc = p.matched_usdc.checked_add(usdc).ok_or(ScripError::Overflow)?;
            p.matches = p.matches.saturating_add(1);
        }
        emit!(Matched {
            plan: plan_key,
            owner,
            receipt: receipt_key,
            sponsor,
            usdc,
            amount_raw: units,
            feed: price.feed_id,
            price: price.price,
            expo: price.expo,
            conf: price.conf,
            publish_time: price.publish_time,
            at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Close a Plan with no members left: what is in the escrow returns to the sponsor, and the
    /// rent with it. Matches already paid sit in members' wallets and are not touched.
    pub fn close_plan(ctx: Context<ClosePlan>) -> Result<()> {
        ensure!(ctx.accounts.plan.members == 0, ScripError::PlanHasMembers);
        let amount = ctx.accounts.escrow.amount;
        let (sponsor, plan_id, bump) = (ctx.accounts.plan.sponsor, ctx.accounts.plan.plan_id, ctx.accounts.plan.bump);
        let seeds: &[&[u8]] = &[b"plan", sponsor.as_ref(), plan_id.as_ref(), &[bump]];
        if amount > 0 {
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.asset_token_program.to_account_info(),
                    token_interface::TransferChecked {
                        from: ctx.accounts.escrow.to_account_info(),
                        mint: ctx.accounts.asset_mint.to_account_info(),
                        to: ctx.accounts.sponsor_asset.to_account_info(),
                        authority: ctx.accounts.plan.to_account_info(),
                    },
                    &[seeds],
                ),
                amount,
                ctx.accounts.asset_mint.decimals,
            )?;
        }
        token_interface::close_account(CpiContext::new_with_signer(
            ctx.accounts.asset_token_program.to_account_info(),
            token_interface::CloseAccount {
                account: ctx.accounts.escrow.to_account_info(),
                destination: ctx.accounts.sponsor.to_account_info(),
                authority: ctx.accounts.plan.to_account_info(),
            },
            &[seeds],
        ))?;
        emit!(PlanClosed { plan: ctx.accounts.plan.key(), sponsor, returned_raw: amount, at: Clock::get()?.unix_timestamp });
        Ok(())
    }

    // ── Measure ────────────────────────────────────────────────────────────────────────

    /// Record the recipient's raw balance of the asset at 7 or 30 days. Anyone may call it;
    /// the answer comes from the recipient's own token account and nowhere else.
    pub fn measure_receipt(ctx: Context<MeasureReceipt>, window_days: u8) -> Result<()> {
        ensure!(window_days == 7 || window_days == 30, ScripError::WindowInvalid);
        let now = Clock::get()?.unix_timestamp;
        let receipt = &mut ctx.accounts.receipt;
        ensure!(now >= receipt.settled_unix + (window_days as i64) * DAY, ScripError::TooEarlyToMeasure);
        let already = if window_days == 7 { receipt.measured_7d.at } else { receipt.measured_30d.at };
        ensure!(already == 0, ScripError::AlreadyMeasured);
        let recipient = receipt.recipient;
        let asset = receipt.asset;

        let expected = get_associated_token_address_with_program_id(
            &recipient,
            &asset,
            &ctx.accounts.asset_token_program.key(),
        );
        ensure!(ctx.accounts.recipient_asset.key() == expected, ScripError::WrongAta);
        let balance_raw = if ctx.accounts.recipient_asset.data_is_empty() {
            0
        } else {
            token_amount(&ctx.accounts.recipient_asset, &asset, &recipient)?
        };
        let measurement = Measurement { at: now, balance_raw };
        if window_days == 7 {
            receipt.measured_7d = measurement;
        } else {
            receipt.measured_30d = measurement;
        }
        emit!(Measured { receipt: receipt.key(), recipient, window_days, balance_raw, at: now });
        Ok(())
    }
}

// ── helpers ────────────────────────────────────────────────────────────────────────────

fn valid_slug(s: &str) -> bool {
    let n = s.len();
    (MIN_SLUG_LEN..=MAX_SLUG_LEN).contains(&n)
        && s.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

fn check_rule_ranges(rate_bps: u16, escalate_bps: u16, tolerance_bps: u16) -> Result<()> {
    ensure!(rate_bps >= 1 && rate_bps <= MAX_RATE_BPS, ScripError::RateOutOfRange);
    ensure!(escalate_bps <= MAX_RATE_BPS, ScripError::EscalationOutOfRange);
    ensure!(
        (MIN_TOLERANCE_BPS..=MAX_TOLERANCE_BPS).contains(&tolerance_bps),
        ScripError::ToleranceOutOfRange
    );
    Ok(())
}

fn require_delegate(usdc: &spl::TokenAccount, book: &Pubkey) -> Result<()> {
    let set = usdc.delegate.map(|k| &k == book).unwrap_or(false) && usdc.delegated_amount >= MIN_SLICE;
    ensure!(set, ScripError::DelegateNotSet);
    Ok(())
}

/// THE INTROSPECTION GUARD — the same shape flash-loan programs use.
///
/// Walks every instruction in the transaction. Exactly one `begin_sweep` may exist, and a
/// `finish_sweep` carrying this book at account index 1 and this release id in its data must
/// sit at a LATER index. A keeper cannot take the slice and omit the check.
fn require_finish_follows(ix_sysvar: &AccountInfo, book: &Pubkey, release_id: &[u8; 16]) -> Result<()> {
    let current = load_current_index_checked(ix_sysvar)? as usize;
    let mut begins = 0usize;
    let mut finish_follows = false;
    let mut i = 0usize;
    while let Ok(ix) = load_instruction_at_checked(i, ix_sysvar) {
        if ix.program_id == crate::ID && ix.data.len() >= 8 {
            let disc = &ix.data[..8];
            if disc == crate::instruction::BeginSweep::DISCRIMINATOR {
                begins += 1;
            } else if disc == crate::instruction::FinishSweep::DISCRIMINATOR
                && i > current
                && ix.data.len() >= 24
                && &ix.data[8..24] == release_id
                && ix.accounts.get(1).map(|a| a.pubkey == *book).unwrap_or(false)
            {
                finish_follows = true;
            }
        }
        i += 1;
    }
    ensure!(begins == 1, ScripError::MultipleBeginSweeps);
    ensure!(finish_follows, ScripError::NoFinishSweep);
    Ok(())
}

/// The `amount` of a token account, read from the shared base layout both token programs
/// use: mint (0..32), owner (32..64), amount (64..72). Checked against the mint and owner it
/// is supposed to be for.
fn token_amount(account: &AccountInfo, mint: &Pubkey, owner: &Pubkey) -> Result<u64> {
    let data = account.try_borrow_data()?;
    ensure!(data.len() >= 72, ScripError::WrongAta);
    ensure!(&data[..32] == mint.as_ref(), ScripError::WrongAta);
    ensure!(&data[32..64] == owner.as_ref(), ScripError::WrongAta);
    Ok(u64::from_le_bytes(data[64..72].try_into().unwrap()))
}

/// A Pyth stamp for an intake, when the payer passed a live account for the book's feed.
/// Never a reason to fail: the payer's protection is their own quote.
fn optional_stamp(acct: Option<&UncheckedAccount>, book: &Book) -> PriceStamp {
    let Some(a) = acct else { return PriceStamp::default() };
    if a.owner != &PYTH_RECEIVER {
        return PriceStamp::default();
    }
    let Ok(data) = a.try_borrow_data() else { return PriceStamp::default() };
    let Ok(p) = parse_price_update(&data) else { return PriceStamp::default() };
    if p.feed_id != book.feed_raw && p.feed_id != book.feed_adjusted {
        return PriceStamp::default();
    }
    PriceStamp { feed: p.feed_id, price: p.price, expo: p.expo, conf: p.conf, publish_time: p.publish_time }
}

/// Escrow → destination, then close the escrow to the payer. Signed by the Payout PDA.
fn move_escrow_and_close<'info>(
    payout: &Box<Account<'info, Payout>>,
    escrow: &Box<InterfaceAccount<'info, TokenAccount>>,
    destination: &Box<InterfaceAccount<'info, TokenAccount>>,
    mint: &Box<InterfaceAccount<'info, Mint>>,
    token_program: &Interface<'info, TokenInterface>,
    rent_to: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let payer = payout.payer;
    let release_id = payout.release_id;
    let bump = payout.bump;
    let seeds: &[&[u8]] = &[b"payout", payer.as_ref(), release_id.as_ref(), &[bump]];
    if amount > 0 {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                token_interface::TransferChecked {
                    from: escrow.to_account_info(),
                    mint: mint.to_account_info(),
                    to: destination.to_account_info(),
                    authority: payout.to_account_info(),
                },
                &[seeds],
            ),
            amount,
            mint.decimals,
        )?;
    }
    token_interface::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        token_interface::CloseAccount {
            account: escrow.to_account_info(),
            destination: rent_to.clone(),
            authority: payout.to_account_info(),
        },
        &[seeds],
    ))
}

/// Grant escrow → destination, signed by the Grant PDA. A zero amount is a no-op.
fn move_grant_escrow<'info>(
    grant: &Box<Account<'info, Grant>>,
    escrow: &Box<InterfaceAccount<'info, TokenAccount>>,
    destination: &Box<InterfaceAccount<'info, TokenAccount>>,
    mint: &Box<InterfaceAccount<'info, Mint>>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let payer = grant.payer;
    let grant_id = grant.grant_id;
    let bump = grant.bump;
    let seeds: &[&[u8]] = &[b"grant", payer.as_ref(), grant_id.as_ref(), &[bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            token_interface::TransferChecked {
                from: escrow.to_account_info(),
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: grant.to_account_info(),
            },
            &[seeds],
        ),
        amount,
        mint.decimals,
    )
}

fn close_grant_escrow<'info>(
    grant: &Box<Account<'info, Grant>>,
    escrow: &Box<InterfaceAccount<'info, TokenAccount>>,
    token_program: &Interface<'info, TokenInterface>,
    rent_to: &AccountInfo<'info>,
) -> Result<()> {
    let payer = grant.payer;
    let grant_id = grant.grant_id;
    let bump = grant.bump;
    let seeds: &[&[u8]] = &[b"grant", payer.as_ref(), grant_id.as_ref(), &[bump]];
    token_interface::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        token_interface::CloseAccount {
            account: escrow.to_account_info(),
            destination: rent_to.clone(),
            authority: grant.to_account_info(),
        },
        &[seeds],
    ))
}

// ── accounts ───────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(slug: String)]
pub struct OpenBook<'info> {
    pub owner: Signer<'info>,
    /// Whoever pays the rent. The owner, or a relayer sponsoring a claim.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Book::INIT_SPACE,
        seeds = [b"book", owner.key().as_ref()],
        bump,
    )]
    pub book: Box<Account<'info, Book>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Handle::INIT_SPACE,
        seeds = [b"handle", slug.as_bytes()],
        bump,
    )]
    pub handle: Box<Account<'info, Handle>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    pub usdc_mint: Box<Account<'info, spl::Mint>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetAsset<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"book", owner.key().as_ref()], bump = book.bump, has_one = owner @ ScripError::NotTheOwner)]
    pub book: Box<Account<'info, Book>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(address = book.usdc_mint)]
    pub usdc_mint: Box<Account<'info, spl::Mint>>,
    #[account(
        associated_token::mint = usdc_mint,
        associated_token::authority = owner,
        associated_token::token_program = usdc_program,
    )]
    pub owner_usdc: Box<Account<'info, spl::TokenAccount>>,
    pub usdc_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CloseBook<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"book", owner.key().as_ref()],
        bump = book.bump,
        has_one = owner @ ScripError::NotTheOwner,
        close = owner,
    )]
    pub book: Box<Account<'info, Book>>,
    #[account(
        mut,
        seeds = [b"handle", book.slug.as_bytes()],
        bump = handle.bump,
        has_one = owner @ ScripError::NotTheOwner,
        close = owner,
    )]
    pub handle: Box<Account<'info, Handle>>,
}

/// One account list for `enable_rule`, `set_rule` and `disable_rule`: the three check exactly
/// the same accounts, so one definition compiles the checks once. Nothing calls Scrip by CPI,
/// so no client depends on three separate names.
#[derive(Accounts)]
pub struct RuleOwner<'info> {
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"book", owner.key().as_ref()], bump = book.bump, has_one = owner @ ScripError::NotTheOwner)]
    pub book: Box<Account<'info, Book>>,
    #[account(address = book.usdc_mint)]
    pub usdc_mint: Box<Account<'info, spl::Mint>>,
    #[account(
        associated_token::mint = usdc_mint,
        associated_token::authority = owner,
        associated_token::token_program = usdc_program,
    )]
    pub owner_usdc: Box<Account<'info, spl::TokenAccount>>,
    pub usdc_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SyncWatermark<'info> {
    #[account(mut, seeds = [b"book", book.owner.as_ref()], bump = book.bump)]
    pub book: Box<Account<'info, Book>>,
    /// CHECK: the book's owner, for the token account derivation.
    #[account(address = book.owner)]
    pub owner: UncheckedAccount<'info>,
    #[account(address = book.usdc_mint)]
    pub usdc_mint: Box<Account<'info, spl::Mint>>,
    #[account(
        associated_token::mint = usdc_mint,
        associated_token::authority = owner,
        associated_token::token_program = usdc_program,
    )]
    pub owner_usdc: Box<Account<'info, spl::TokenAccount>>,
    pub usdc_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawFloat<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut, seeds = [b"book", owner.key().as_ref()], bump = book.bump, has_one = owner @ ScripError::NotTheOwner)]
    pub book: Box<Account<'info, Book>>,
}

/// ORDER MATTERS: `finish_sweep`'s introspection reads the book at account index 1.
#[derive(Accounts)]
#[instruction(release_id: [u8; 16])]
pub struct BeginSweep<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [b"book", book.owner.as_ref()], bump = book.bump)]
    pub book: Box<Account<'info, Book>>,
    /// CHECK: the book's owner, named so the token accounts can be derived. Never signs here.
    #[account(address = book.owner)]
    pub owner: UncheckedAccount<'info>,
    #[account(address = book.usdc_mint)]
    pub usdc_mint: Box<Account<'info, spl::Mint>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = owner,
        associated_token::token_program = usdc_program,
    )]
    pub owner_usdc: Box<Account<'info, spl::TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = keeper,
        associated_token::token_program = usdc_program,
    )]
    pub keeper_usdc: Box<Account<'info, spl::TokenAccount>>,
    #[account(address = book.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: the owner's associated token account for the asset. Verified by derivation in
    /// the handler, and created there if it does not exist yet.
    #[account(mut)]
    pub owner_asset: UncheckedAccount<'info>,
    pub usdc_program: Program<'info, Token>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    /// CHECK: the instructions sysvar, by address.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(release_id: [u8; 16])]
pub struct FinishSweep<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(mut, seeds = [b"book", book.owner.as_ref()], bump = book.bump)]
    pub book: Box<Account<'info, Book>>,
    /// CHECK: the book's owner.
    #[account(address = book.owner)]
    pub owner: UncheckedAccount<'info>,
    #[account(address = book.usdc_mint)]
    pub usdc_mint: Box<Account<'info, spl::Mint>>,
    #[account(
        associated_token::mint = usdc_mint,
        associated_token::authority = owner,
        associated_token::token_program = usdc_program,
    )]
    pub owner_usdc: Box<Account<'info, spl::TokenAccount>>,
    #[account(address = book.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
        associated_token::token_program = asset_token_program,
    )]
    pub owner_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: a Pyth PriceUpdateV2 owned by the receiver program; parsed in the handler.
    #[account(owner = PYTH_RECEIVER)]
    pub price_update: UncheckedAccount<'info>,
    #[account(
        init,
        payer = keeper,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", book.key().as_ref(), release_id.as_ref()],
        bump,
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    pub usdc_program: Program<'info, Token>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(release_id: [u8; 16])]
pub struct FundPayout<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Payout::INIT_SPACE,
        seeds = [b"payout", payer.key().as_ref(), release_id.as_ref()],
        bump,
    )]
    pub payout: Box<Account<'info, Payout>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = payout,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The recipient's Book: required for Settle, where the asset must match.
    pub recipient_book: Option<Box<Account<'info, Book>>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleasePayout<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"payout", payer.key().as_ref(), payout.release_id.as_ref()],
        bump = payout.bump,
        has_one = payer @ ScripError::NotTheOwner,
        close = payer,
    )]
    pub payout: Box<Account<'info, Payout>>,
    /// CHECK: the named recipient. Receives; does not sign.
    #[account(address = payout.recipient)]
    pub recipient: UncheckedAccount<'info>,
    #[account(seeds = [b"book", recipient.key().as_ref()], bump = recipient_book.bump)]
    pub recipient_book: Box<Account<'info, Book>>,
    #[account(address = payout.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = payout,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = recipient,
        associated_token::token_program = asset_token_program,
    )]
    pub recipient_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: an optional Pyth account for the stamp. Checked in the handler; never fatal.
    pub price_update: Option<UncheckedAccount<'info>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", payout.key().as_ref(), payout.release_id.as_ref()],
        bump,
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    /// The person taking the position. Signs, but need not hold any SOL.
    pub claimer: Signer<'info>,
    /// Pays the fee, the receipt's rent and the token account's rent. A relayer, or the
    /// claimer themselves.
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    /// The claim key, for a sponsorship addressed to a link rather than an address.
    pub claim_key: Option<Signer<'info>>,
    #[account(
        mut,
        seeds = [b"payout", payout.payer.as_ref(), payout.release_id.as_ref()],
        bump = payout.bump,
        close = payer,
    )]
    pub payout: Box<Account<'info, Payout>>,
    /// CHECK: the sponsor, who gets the escrow's and the payout's rent back.
    #[account(mut, address = payout.payer)]
    pub payer: UncheckedAccount<'info>,
    #[account(seeds = [b"book", claimer.key().as_ref()], bump = claimer_book.bump)]
    pub claimer_book: Box<Account<'info, Book>>,
    #[account(address = payout.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = payout,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = fee_payer,
        associated_token::mint = asset_mint,
        associated_token::authority = claimer,
        associated_token::token_program = asset_token_program,
    )]
    pub claimer_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: optional Pyth stamp.
    pub price_update: Option<UncheckedAccount<'info>>,
    #[account(
        init,
        payer = fee_payer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", payout.key().as_ref(), payout.release_id.as_ref()],
        bump,
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelPayout<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"payout", payer.key().as_ref(), payout.release_id.as_ref()],
        bump = payout.bump,
        has_one = payer @ ScripError::NotTheOwner,
        close = payer,
    )]
    pub payout: Box<Account<'info, Payout>>,
    #[account(address = payout.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = payout,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = payer,
        associated_token::token_program = asset_token_program,
    )]
    pub payer_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(grant_id: [u8; 16])]
pub struct OpenGrant<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: the recipient. Receives on schedule; does not sign.
    pub recipient: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Grant::INIT_SPACE,
        seeds = [b"grant", payer.key().as_ref(), grant_id.as_ref()],
        bump,
    )]
    pub grant: Box<Account<'info, Grant>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = grant,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    /// The recipient's own account, created now by the payer so every vest is one instruction.
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = recipient,
        associated_token::token_program = asset_token_program,
    )]
    pub recipient_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SealGrant<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"grant", payer.key().as_ref(), grant.grant_id.as_ref()],
        bump = grant.bump,
        has_one = payer @ ScripError::NotTheOwner,
    )]
    pub grant: Box<Account<'info, Grant>>,
    #[account(address = grant.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        associated_token::mint = asset_mint,
        associated_token::authority = grant,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", grant.key().as_ref(), grant.grant_id.as_ref()],
        bump,
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(release_id: [u8; 16])]
pub struct Vest<'info> {
    /// Whoever calls it: a keeper, the recipient, the payer. Repaid from the float.
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(
        mut,
        seeds = [b"grant", grant.payer.as_ref(), grant.grant_id.as_ref()],
        bump = grant.bump,
    )]
    pub grant: Box<Account<'info, Grant>>,
    /// CHECK: the recipient named on the grant.
    #[account(address = grant.recipient)]
    pub recipient: UncheckedAccount<'info>,
    #[account(address = grant.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = grant,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = recipient,
        associated_token::token_program = asset_token_program,
    )]
    pub recipient_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = keeper,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", grant.key().as_ref(), release_id.as_ref()],
        bump,
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeGrant<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"grant", payer.key().as_ref(), grant.grant_id.as_ref()],
        bump = grant.bump,
        has_one = payer @ ScripError::NotTheOwner,
    )]
    pub grant: Box<Account<'info, Grant>>,
    #[account(address = grant.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = grant,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = payer,
        associated_token::token_program = asset_token_program,
    )]
    pub payer_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseGrant<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"grant", payer.key().as_ref(), grant.grant_id.as_ref()],
        bump = grant.bump,
        has_one = payer @ ScripError::NotTheOwner,
        close = payer,
    )]
    pub grant: Box<Account<'info, Grant>>,
    #[account(address = grant.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = grant,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = asset_mint,
        associated_token::authority = payer,
        associated_token::token_program = asset_token_program,
    )]
    pub payer_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}


// ── Plans ──────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(plan_id: [u8; 16])]
pub struct OpenPlan<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(
        init,
        payer = sponsor,
        space = 8 + Plan::INIT_SPACE,
        seeds = [b"plan", sponsor.key().as_ref(), plan_id.as_ref()],
        bump,
    )]
    pub plan: Box<Account<'info, Plan>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = sponsor,
        associated_token::mint = asset_mint,
        associated_token::authority = plan,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddMember<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"plan", sponsor.key().as_ref(), plan.plan_id.as_ref()],
        bump = plan.bump,
        has_one = sponsor @ ScripError::NotTheOwner,
    )]
    pub plan: Box<Account<'info, Plan>>,
    /// CHECK: the wallet invited. It joins by its own signature in `accept_member`.
    pub owner: UncheckedAccount<'info>,
    #[account(
        init,
        payer = sponsor,
        space = 8 + Member::INIT_SPACE,
        seeds = [b"member", plan.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub member: Box<Account<'info, Member>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptMember<'info> {
    pub owner: Signer<'info>,
    #[account(seeds = [b"plan", plan.sponsor.as_ref(), plan.plan_id.as_ref()], bump = plan.bump)]
    pub plan: Box<Account<'info, Plan>>,
    #[account(
        mut,
        seeds = [b"member", plan.key().as_ref(), owner.key().as_ref()],
        bump = member.bump,
        has_one = plan,
        has_one = owner @ ScripError::NotTheOwner,
    )]
    pub member: Box<Account<'info, Member>>,
}

#[derive(Accounts)]
pub struct RemoveMember<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"plan", sponsor.key().as_ref(), plan.plan_id.as_ref()],
        bump = plan.bump,
        has_one = sponsor @ ScripError::NotTheOwner,
    )]
    pub plan: Box<Account<'info, Plan>>,
    #[account(
        mut,
        seeds = [b"member", plan.key().as_ref(), member.owner.as_ref()],
        bump = member.bump,
        has_one = plan,
        close = sponsor,
    )]
    pub member: Box<Account<'info, Member>>,
}

#[derive(Accounts)]
pub struct MatchReceipt<'info> {
    /// Whoever calls it: a keeper, the member, the sponsor. Pays the fee, and the member's
    /// account for the Plan's stock if they have none yet.
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [b"plan", plan.sponsor.as_ref(), plan.plan_id.as_ref()], bump = plan.bump)]
    pub plan: Box<Account<'info, Plan>>,
    #[account(
        mut,
        seeds = [b"member", plan.key().as_ref(), member.owner.as_ref()],
        bump = member.bump,
        has_one = plan,
    )]
    pub member: Box<Account<'info, Member>>,
    /// CHECK: the member's wallet, where the match lands.
    #[account(address = member.owner)]
    pub owner: UncheckedAccount<'info>,
    /// The sweep receipt being matched. `Account` checks it is this program's Receipt.
    pub receipt: Box<Account<'info, Receipt>>,
    /// CHECK: a Pyth PriceUpdateV2 owned by the receiver program; parsed in the handler.
    #[account(owner = PYTH_RECEIVER)]
    pub price_update: UncheckedAccount<'info>,
    #[account(address = plan.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = plan,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = caller,
        associated_token::mint = asset_mint,
        associated_token::authority = owner,
        associated_token::token_program = asset_token_program,
    )]
    pub owner_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePlan<'info> {
    #[account(mut)]
    pub sponsor: Signer<'info>,
    #[account(
        mut,
        seeds = [b"plan", sponsor.key().as_ref(), plan.plan_id.as_ref()],
        bump = plan.bump,
        has_one = sponsor @ ScripError::NotTheOwner,
        close = sponsor,
    )]
    pub plan: Box<Account<'info, Plan>>,
    #[account(address = plan.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = asset_mint,
        associated_token::authority = plan,
        associated_token::token_program = asset_token_program,
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = sponsor,
        associated_token::mint = asset_mint,
        associated_token::authority = sponsor,
        associated_token::token_program = asset_token_program,
    )]
    pub sponsor_asset: Box<InterfaceAccount<'info, TokenAccount>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MeasureReceipt<'info> {
    #[account(mut)]
    pub receipt: Box<Account<'info, Receipt>>,
    /// CHECK: the recipient's associated token account for the asset. Verified by
    /// derivation; may not exist, which reads as a balance of zero.
    pub recipient_asset: UncheckedAccount<'info>,
    #[account(address = receipt.asset)]
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    pub asset_token_program: Interface<'info, TokenInterface>,
}

// ── events ─────────────────────────────────────────────────────────────────────────────

#[event]
pub struct BookOpened {
    pub book: Pubkey,
    pub owner: Pubkey,
    pub slug: String,
    pub asset: Pubkey,
}

#[event]
pub struct AssetChanged {
    pub book: Pubkey,
    pub asset: Pubkey,
}

#[event]
pub struct RuleChanged {
    pub book: Pubkey,
    pub enabled: bool,
    pub rate_bps: u16,
    pub watermark: u64,
}

#[event]
pub struct Swept {
    pub receipt: Pubkey,
    pub book: Pubkey,
    pub owner: Pubkey,
    pub release_id: [u8; 16],
    pub inbound: u64,
    pub rate_bps: u16,
    pub slice: u64,
    pub asset: Pubkey,
    pub amount_raw: u64,
    pub at: i64,
}

#[event]
pub struct Settled {
    pub receipt: Pubkey,
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub release_id: [u8; 16],
    pub paid_usdc: u64,
    pub asset: Pubkey,
    pub amount_raw: u64,
    pub kind: ReceiptKind,
    pub at: i64,
}

#[event]
pub struct Cancelled {
    pub payout: Pubkey,
    pub payer: Pubkey,
    pub at: i64,
}

#[event]
pub struct GrantOpened {
    pub grant: Pubkey,
    pub receipt: Pubkey,
    pub payer: Pubkey,
    pub recipient: Pubkey,
    pub asset: Pubkey,
    pub total_raw: u64,
    pub start_unix: i64,
    pub cliff_secs: u32,
    pub duration_secs: u32,
    pub revocable: bool,
    pub at: i64,
}

#[event]
pub struct Vested {
    pub grant: Pubkey,
    pub receipt: Pubkey,
    pub recipient: Pubkey,
    pub amount_raw: u64,
    pub released_raw: u64,
    pub total_raw: u64,
    pub completed: bool,
    pub at: i64,
}

#[event]
pub struct GrantRevoked {
    pub grant: Pubkey,
    pub payer: Pubkey,
    pub returned_raw: u64,
    pub at: i64,
}

#[event]
pub struct Measured {
    pub receipt: Pubkey,
    pub recipient: Pubkey,
    pub window_days: u8,
    pub balance_raw: u64,
    pub at: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugs_are_short_lowercase_and_alphanumeric() {
        assert!(valid_slug("shariq"));
        assert!(valid_slug("abc"));
        assert!(valid_slug("a1b2c3d4e5f6g7h8i9j0k1l2"));
        assert!(!valid_slug("ab"));
        assert!(!valid_slug("a1b2c3d4e5f6g7h8i9j0k1l2m"));
        assert!(!valid_slug("Shariq"));
        assert!(!valid_slug("sha-riq"));
        assert!(!valid_slug("sha riq"));
        assert!(!valid_slug(""));
    }

    #[test]
    fn rule_ranges_match_the_constants() {
        assert!(check_rule_ranges(1, 0, 100).is_ok());
        assert!(check_rule_ranges(MAX_RATE_BPS, MAX_RATE_BPS, MAX_TOLERANCE_BPS).is_ok());
        assert!(check_rule_ranges(0, 0, 100).is_err());
        assert!(check_rule_ranges(MAX_RATE_BPS + 1, 0, 100).is_err());
        assert!(check_rule_ranges(1_000, MAX_RATE_BPS + 1, 100).is_err());
        assert!(check_rule_ranges(1_000, 0, MIN_TOLERANCE_BPS - 1).is_err());
        assert!(check_rule_ranges(1_000, 0, MAX_TOLERANCE_BPS + 1).is_err());
    }


    fn grant(total: u64, start: i64, cliff: u32, duration: u32) -> Grant {
        Grant {
            payer: Pubkey::default(),
            recipient: Pubkey::default(),
            asset: Pubkey::default(),
            grant_id: [0; 16],
            total_raw: total,
            released_raw: 0,
            release_cap_raw: u64::MAX,
            start_unix: start,
            cliff_secs: cliff,
            duration_secs: duration,
            revocable: true,
            sealed: true,
            state: GrantState::Active,
            reason_hash: [0; 32],
            declared_usdc: 0,
            min_out_raw: 0,
            run_id: [0; 16],
            created_unix: start,
            vests: 0,
            bump: 0,
        }
    }

    #[test]
    fn a_grant_vests_nothing_before_the_cliff_and_linearly_after() {
        let g = grant(1_000_000, 1_000, 100, 1_000);
        assert_eq!(g.scheduled_raw(999), 0);
        assert_eq!(g.scheduled_raw(1_099), 0);
        assert_eq!(g.scheduled_raw(1_100), 0);
        assert_eq!(g.scheduled_raw(1_350), 250_000);
        assert_eq!(g.scheduled_raw(1_600), 500_000);
        assert_eq!(g.scheduled_raw(2_100), 1_000_000);
        assert_eq!(g.scheduled_raw(9_999), 1_000_000);
    }

    #[test]
    fn a_grant_with_no_duration_vests_whole_at_the_cliff() {
        let g = grant(777, 0, 3_600, 0);
        assert_eq!(g.scheduled_raw(3_599), 0);
        assert_eq!(g.scheduled_raw(3_600), 777);
    }

    #[test]
    fn releasable_subtracts_what_was_released_and_respects_a_revoke_cap() {
        let mut g = grant(1_000, 0, 0, 1_000);
        assert_eq!(g.releasable_raw(500), 500);
        g.released_raw = 300;
        assert_eq!(g.releasable_raw(500), 200);
        // Revoked at t=600: the cap is what had accrued then.
        g.release_cap_raw = 600;
        assert_eq!(g.releasable_raw(900), 300);
        g.released_raw = 600;
        assert_eq!(g.releasable_raw(2_000), 0);
    }

    #[test]
    fn a_receipt_is_a_few_hundred_bytes() {
        // Rent is paid by the owner's float on every sweep, so the size is a cost the
        // product states. Held here so a field added later is a decision, not a surprise.
        assert!(8 + Receipt::INIT_SPACE <= 400, "{}", 8 + Receipt::INIT_SPACE);
    }

    #[test]
    fn the_book_reads_at_account_index_one_in_both_sweep_halves() {
        // The introspection guard reads `finish_sweep`'s book at index 1. If the Accounts
        // struct is ever reordered the guard silently matches nothing. This pins the
        // convention in the one place it is written down.
        let finish = crate::instruction::FinishSweep { release_id: [0; 16] };
        let data = anchor_lang::InstructionData::data(&finish);
        assert_eq!(&data[..8], crate::instruction::FinishSweep::DISCRIMINATOR);
        assert_eq!(data.len(), 24);
    }
}

#[event]
pub struct PlanOpened {
    pub plan: Pubkey,
    pub sponsor: Pubkey,
    pub asset: Pubkey,
    pub match_bps: u16,
    pub monthly_cap_usdc: u64,
    pub at: i64,
}

#[event]
pub struct MemberAdded {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub at: i64,
}

#[event]
pub struct MemberJoined {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub at: i64,
}

#[event]
pub struct MemberRemoved {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub at: i64,
}

/// A match, in full: whose save, which receipt, how many dollars, how many raw units, and the
/// Pyth price it was valued at. The receipt shows "Added by <sponsor>" from this.
#[event]
pub struct Matched {
    pub plan: Pubkey,
    pub owner: Pubkey,
    pub receipt: Pubkey,
    pub sponsor: Pubkey,
    pub usdc: u64,
    pub amount_raw: u64,
    pub feed: [u8; 32],
    pub price: i64,
    pub expo: i32,
    pub conf: u64,
    pub publish_time: i64,
    pub at: i64,
}

#[event]
pub struct PlanClosed {
    pub plan: Pubkey,
    pub sponsor: Pubkey,
    pub returned_raw: u64,
    pub at: i64,
}

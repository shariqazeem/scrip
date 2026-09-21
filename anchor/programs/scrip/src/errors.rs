use anchor_lang::prelude::*;

#[error_code]
pub enum ScripError {
    #[msg("A handle is 3 to 24 characters of a-z and 0-9.")]
    SlugInvalid,
    #[msg("That asset is not on the registry.")]
    AssetNotRegistered,
    #[msg("An xStocks asset needs an eligibility attestation (terms_version >= 1).")]
    TermsRequired,
    #[msg("The pay-in mint is not the one this program accepts.")]
    WrongUsdcMint,
    #[msg("The pay-in mint must have six decimals.")]
    WrongUsdcDecimals,
    #[msg("The rate must be between 0.01% and 50%.")]
    RateOutOfRange,
    #[msg("Escalation must be between 0 and 50%.")]
    EscalationOutOfRange,
    #[msg("The tolerance must be between 0.5% and 3%.")]
    ToleranceOutOfRange,
    #[msg("The rule is already on.")]
    RuleAlreadyEnabled,
    #[msg("The rule is not on.")]
    RuleNotEnabled,
    #[msg("A sweep is in progress; finish it first.")]
    RulePending,
    #[msg("The Book is not the delegate on the USDC account. Approve it first.")]
    DelegateNotSet,
    #[msg("The delegate is still set. Revoke it in the same transaction.")]
    DelegateStillSet,
    #[msg("This instruction must be top-level, not a CPI.")]
    NotTopLevel,
    #[msg("No finish_sweep for this book and release follows in this transaction.")]
    NoFinishSweep,
    #[msg("Exactly one begin_sweep per transaction.")]
    MultipleBeginSweeps,
    #[msg("The net inflow is below the rule's minimum.")]
    InboundBelowMinimum,
    #[msg("The slice would be below the $0.50 minimum.")]
    SliceBelowMinimum,
    #[msg("The delegate allowance is smaller than the slice. Re-approve.")]
    AllowanceTooLow,
    #[msg("The Book's float cannot cover the tip and the receipt's rent. Top up.")]
    FloatTooLow,
    #[msg("There is no sweep pending on this book.")]
    NoPending,
    #[msg("The pending sweep does not match this instruction.")]
    PendingMismatch,
    #[msg("The owner's cash moved between begin and finish. Nothing settles.")]
    CashMoved,
    #[msg("The price account is not for this book's asset.")]
    PriceFeedWrong,
    #[msg("The price is older than ten minutes. The sweep waits.")]
    PriceStale,
    #[msg("The price's confidence band is wider than 1%.")]
    PriceUncertain,
    #[msg("The price account could not be read.")]
    PriceInvalid,
    #[msg("The price update is not fully verified.")]
    PriceNotFullyVerified,
    #[msg("The mint's scaled-UI multiplier is outside anything a corporate action produces.")]
    MultiplierInvalid,
    #[msg("Less arrived than the price allows. Everything reverts.")]
    ReceivedBelowMinimum,
    #[msg("Only the owner may do this.")]
    NotTheOwner,
    #[msg("This payout is not of the kind this instruction handles.")]
    WrongKind,
    #[msg("The escrow holds less than the payer's own minimum.")]
    EscrowBelowMinimum,
    #[msg("The escrow is empty.")]
    EscrowEmpty,
    #[msg("A settle payout needs a recipient.")]
    RecipientRequired,
    #[msg("A settle payout needs the recipient's Book.")]
    BookRequired,
    #[msg("The recipient's Book is set to a different asset.")]
    AssetMismatch,
    #[msg("This payout is for someone else.")]
    NotTheRecipient,
    #[msg("This payout needs its claim key.")]
    ClaimKeyRequired,
    #[msg("A sponsored position may be cancelled after thirty days.")]
    TooEarlyToCancel,
    #[msg("The window is 7 or 30 days.")]
    WindowInvalid,
    #[msg("This receipt is not old enough to measure yet.")]
    TooEarlyToMeasure,
    #[msg("This window was already measured.")]
    AlreadyMeasured,
    #[msg("That is not the associated token account this instruction expects.")]
    WrongAta,
    #[msg("Arithmetic overflow.")]
    Overflow,
    #[msg("Turn the rule off before closing the book.")]
    RuleStillOn,
    #[msg("The token program does not own that mint.")]
    WrongTokenProgram,
    #[msg("The float withdrawal would leave the Book below its rent.")]
    FloatBelowRent,
    #[msg("Nothing to withdraw.")]
    NothingToWithdraw,
    #[msg("The balance is not below the watermark; there is nothing to sync.")]
    WatermarkNotAbove,
    #[msg("A grant needs a recipient.")]
    GrantRecipientRequired,
    #[msg("A grant's schedule must be within ten years.")]
    GrantScheduleInvalid,
    #[msg("The grant is not sealed; nothing can vest.")]
    GrantNotSealed,
    #[msg("The grant was already sealed.")]
    GrantAlreadySealed,
    #[msg("Nothing has vested yet.")]
    NothingToVest,
    #[msg("This grant is not active.")]
    GrantNotActive,
    #[msg("This grant is not revocable.")]
    GrantNotRevocable,
    #[msg("A grant closes only when completed or revoked, with an empty escrow.")]
    GrantStillOpen,
    #[msg("The grant's float cannot cover the tip and the receipt's rent. Top up.")]
    GrantFloatTooLow,
}

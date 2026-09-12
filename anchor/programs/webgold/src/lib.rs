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
///
/// Accounts and instructions arrive in dependency order (see docs/build-order.md): the book
/// and its policy first, then funded and released payouts with their receipts, then named
/// sends, sponsorships and goal vaults.
#[program]
pub mod webgold {
    use super::*;

    /// A build-order placeholder so the workspace compiles and the IDL is real from day one.
    /// Replaced by `open_book` at build-order step 2.
    pub fn ping(_ctx: Context<Ping>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Ping {}

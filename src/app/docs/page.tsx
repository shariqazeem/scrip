import type { Metadata } from "next";
import Link from "next/link";
import { DocFrame } from "@/components/docs/doc-frame";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Scrip works: a rule on a wallet, the save that is atomic without a Jupiter CPI, receipts anyone can open, keep-rate measured on chain, Plans that match savers, and Scrip Curve's launches whose fees fund the matches.",
};

export default function DocsPage() {
  return (
    <DocFrame
      here="/docs"
      eyebrow="Docs"
      title="What Scrip does, and what it refuses to do."
      lede={
        <>
          Scrip turns money moving on Solana into stocks people own. A slice of every payment you receive becomes stock in your own wallet, by
          itself; whoever pays you can match it with a Plan; and every token launched on Scrip Curve pays a share of its trading fees into those
          matches. It never decides amounts and never gives advice.
        </>
      }
    >
      <h2>The objects</h2>
      <ol>
        <li>
          <strong>A rule</strong> — a rate, an asset, an optional floor and cap — on your own USDC account, held in a Book you own, enforced
          by the program, and carried out automatically by Scrip.
        </li>
        <li>
          <strong>A receipt</strong> — a permanent on-chain account written in the same transaction as the conversion, measured at 7 and 30
          days.
        </li>
        <li>
          <strong>A pay link</strong> — <span className="mono">/pay/&lt;handle&gt;</span> — the intake for attributed payments: an invoice with a
          reason, a gift, a payment to someone with no rule yet. Same conversion, same receipt, different signer.
        </li>
        <li>
          <strong>A Plan</strong> — a match the program enforces: stock in an escrow the Plan owns, a share of every automatic save its members
          make, capped each month. <Link href="/teams">Plans</Link>
        </li>
        <li>
          <strong>A launch on Scrip Curve</strong> — a token on Meteora&rsquo;s Dynamic Bonding Curve priced in a stock; the savers&rsquo; share of
          its trading fees goes into the Plan in that stock. <Link href="/docs/scrip-curve">How a launch pays savers</Link>
        </li>
        <li>
          <strong>A public ledger</strong> — every receipt, and keep-rate.
        </li>
      </ol>

      <h2>The rule</h2>
      <p>
        <strong>Turn on.</strong> You open a Book (a handle, an asset, an eligibility attestation) and turn the rule on in one signature:
        the rate, floor and cap are written; your current USDC balance becomes the watermark; an allowance is approved to the Book&rsquo;s
        address as token delegate; a small SOL float is deposited on the Book to pay for receipts and the small fee for submitting each save.
      </p>
      <p>
        <strong>Sweep.</strong> Whenever your USDC balance rises above the watermark by at least the minimum, Scrip submits one atomic
        transaction: the program computes the slice from on-chain state, moves exactly that much USDC through the delegate, a Jupiter swap
        turns it into the asset landing directly in your own token account, and the program verifies what arrived against Pyth and writes
        the receipt. If any step fails, nothing moves.
      </p>
      <p>
        <strong>Pause.</strong> One click calls the token program&rsquo;s <span className="mono">revoke</span>. No sweep can happen until you
        approve again. Resuming resets the watermark to the current balance, so money that landed while paused is not taxed. The program
        cannot prevent a pause.
      </p>

      <h2>The program</h2>
      <p>
        Anchor, id <span className="mono">{SCRIP_PROGRAM_ID.toBase58()}</span>. Seven account types: Book, Handle, Payout, Grant, Receipt,
        Plan, Member. Twenty-six instructions, and anything not listed does not exist. The program never CPIs Jupiter: swaps are top-level
        instructions in the same transaction, and the program makes the transaction atomic around them with instruction introspection, the
        pattern flash-loan programs use. Scrip Curve adds no program of its own: launches run on Meteora&rsquo;s DBC and DAMM v2, and their fees
        reach savers through the Plan.
      </p>
      <p>
        <Link href="/docs/how-the-rule-sees-money">How the rule sees money</Link> ·{" "}
        <Link href="/docs/receipts">Receipts</Link> · <Link href="/docs/keep-rate">Keep-rate</Link> · <Link href="/docs/corporate-actions">Corporate actions</Link> ·{" "}
        <Link href="/docs/scrip-curve">How a launch pays savers</Link>
      </p>

      <h2>What it is not</h2>
      <p>
        Not a trading terminal, a robo-advisor, a lender, a card, a social feed or a brokerage. Scrip Curve launches tokens, and there too
        Scrip decides nothing about a price, only where the fees go. Not our custody: your USDC and your stock sit in token accounts you own;
        the program holds a rule and writes receipts. Not stable: equities fall, and the interface says so.
      </p>
    </DocFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { DocFrame } from "@/components/docs/doc-frame";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Scrip works: a rule on a wallet, the sweep that is atomic without a Jupiter CPI, receipts anyone can open, and keep-rate measured on chain.",
};

export default function DocsPage() {
  return (
    <DocFrame
      here="/docs"
      eyebrow="Docs"
      title="What Scrip does, and what it refuses to do."
      lede={
        <>
          Scrip is a rule on your wallet: a slice of every dollar that lands becomes stock, in the same wallet, with a receipt. It never
          decides amounts, never holds an asset across a slot, never gives advice.
        </>
      }
    >
      <h2>Four objects</h2>
      <ol>
        <li>
          <strong>A rule</strong> — a rate, an asset, an optional floor and cap — on your own USDC account, held in a Book you own, enforced
          by the program, driven by permissionless keepers.
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
          <strong>A public ledger</strong> — every receipt, and keep-rate.
        </li>
      </ol>

      <h2>The rule</h2>
      <p>
        <strong>Turn on.</strong> You open a Book (a handle, an asset, an eligibility attestation) and turn the rule on in one signature:
        the rate, floor and cap are written; your current USDC balance becomes the watermark; an allowance is approved to the Book&rsquo;s
        address as token delegate; a small SOL float is deposited on the Book to pay for receipts and keeper tips.
      </p>
      <p>
        <strong>Sweep.</strong> Whenever your USDC balance rises above the watermark by at least the minimum, a keeper submits one atomic
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
        Anchor, id <span className="mono">{SCRIP_PROGRAM_ID.toBase58()}</span>. Four account types: Book, Handle, Payout, Receipt. Fifteen
        instructions, and anything not listed does not exist. The program never CPIs Jupiter: swaps are top-level instructions in the same
        transaction, and the program makes the transaction atomic around them with instruction introspection, the pattern flash-loan
        programs use.
      </p>
      <p>
        <Link href="/docs/how-the-rule-sees-money">How the rule sees money</Link> · <Link href="/docs/keepers">What a keeper can and cannot do</Link> ·{" "}
        <Link href="/docs/receipts">Receipts</Link> · <Link href="/docs/keep-rate">Keep-rate</Link> · <Link href="/docs/corporate-actions">Corporate actions</Link>
      </p>

      <h2>What it is not</h2>
      <p>
        Not a trading terminal, a robo-advisor, a lender, a card, a social feed, a launchpad or a brokerage. Not our custody: your USDC and
        your stock sit in token accounts you own; the program holds a rule and writes receipts. Not stable: equities fall, and the interface
        says so.
      </p>
    </DocFrame>
  );
}

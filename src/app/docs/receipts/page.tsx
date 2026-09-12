import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { DocFrame } from "@/components/docs/doc-frame";

export const metadata: Metadata = {
  title: "Receipts",
  description:
    "Every money moment in Webgold writes an account on Solana carrying who paid, who received, the amounts mint by mint, the gram-equivalent and the reason. Here is what is in one and how to read it without trusting us.",
};

export default function ReceiptsPage() {
  return (
    <DocFrame
      here="/docs/receipts"
      eyebrow="Docs"
      title="An arrival you can open, forever."
      lede={
        <>
          A receipt is a program account, not a row in our database. That is the difference
          between a memory we could lose — or be accused of inventing — and one anybody can
          open for as long as Solana exists.
        </>
      }
    >
      <h2>What is in one</h2>
      <div className="wg-doc-worked">
        <div className="wg-doc-worked-head">The Receipt account</div>
        <div className="wg-doc-worked-row">
          <span>Who paid</span>
          <span className="mono">payer</span>
          <span className="mono">32 bytes</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>Who received</span>
          <span className="mono">recipient</span>
          <span className="mono">32 bytes</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>What arrived, mint by mint</span>
          <span className="mono">legs</span>
          <span className="mono">up to 8</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>What it was worth at the price stamp</span>
          <span className="mono">value_base</span>
          <span className="mono">6dp USD</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>Fine grams of gold in it</span>
          <span className="mono">grams_e8</span>
          <span className="mono">1e8 fixed</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>Why, in the payer&rsquo;s own words</span>
          <span className="mono">reason</span>
          <span className="mono">≤200 chars</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>Which release it belonged to</span>
          <span className="mono">release_id</span>
          <span className="mono">32 bytes</span>
        </div>
      </div>

      <h2>Where it lives, and why that address</h2>
      <p>
        A receipt sits at a program address derived from{" "}
        <code>[&quot;receipt&quot;, release_id, recipient]</code>. That is not an
        implementation detail — it means anybody who knows a release and a recipient can
        compute the address and read the account without asking us anything, and it means one
        person can receive at most one receipt per release. A second attempt asks the runtime
        to create an account that already exists, and the runtime refuses. Nothing has to
        remember who was paid; the address is the record.
      </p>

      <h2>The receipt is written in the same instruction as the transfer</h2>
      <p>
        There is no state in which value moved and no record of it exists, and no state in
        which a receipt exists for value that did not move. Both happen or neither does,
        because a Solana instruction cannot half-succeed.
      </p>

      <h2>What it says, and what it deliberately does not</h2>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          <strong>The reason is asserted by the payer, not verified by us.</strong> Whether the
          work described actually happened, whether a human approved it, whether a model
          checked it — all of that lives outside this system, or nowhere. Webgold settles; it
          does not judge. A receipt records what moved and what was claimed about it.
        </p>
      </div>
      <p>
        The value is stamped at the price used at settlement, and it does not move afterwards.
        A receipt is a record of an arrival, not a live valuation — what that value is worth
        today is a question about a balance, and the answer is on the book.
      </p>

      <h2>Reading one without trusting us</h2>
      <p>
        Open <code>/receipt/&lt;signature&gt;</code>. That page is built from the signature and
        nothing else: no session, no database, no account. It renders identically from a cold
        RPC with our servers switched off. Every figure on it is read from an account you can
        also read, and the page links to both the account and the transaction on an explorer so
        you never have to take the rendering on trust.
      </p>

      <h2>A payout that is partly diverted</h2>
      <p>
        When a recipient has a goal taking a share of arrivals, the receipt still records the{" "}
        <strong>whole</strong> arrival. The skim is where the value went, not a reduction in
        what was received — and the vault it went to can only ever pay that same person.
      </p>

      <p>
        <Link href="/docs/keep-rate">The number this makes possible</Link> ·{" "}
        <Link href="/ledger">Every receipt published so far</Link>
      </p>
    </DocFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { DocFrame } from "@/components/docs/doc-frame";
import { KEEP_RATE_WINDOW_DAYS } from "@/lib/keep-rate";

export const metadata: Metadata = {
  title: "Keep-rate",
  description:
    "The share of released value still held thirty days later. Its denominator is stamped on chain by the program when value moves, and its numerator is the recipient's own public balance — so anyone can reproduce it.",
};

export default function KeepRatePage() {
  return (
    <DocFrame
      here="/docs/keep-rate"
      eyebrow="Docs"
      title={`The share still held after ${KEEP_RATE_WINDOW_DAYS} days.`}
      lede={
        <>
          It is the difference between a payout and a farm. It is also the only number in this
          category that cannot be produced after the fact, because producing it requires a
          decision made before the first payment rather than after.
        </>
      }
    >
      <h2>Both ends are public</h2>
      <div className="wg-doc-worked">
        <div className="wg-doc-worked-head">How the fraction is built</div>
        <div className="wg-doc-worked-row">
          <span>Denominator: value at release</span>
          <span className="mono">Cohort account</span>
          <span className="mono">on chain</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>Numerator: what they hold now</span>
          <span className="mono">their token accounts</span>
          <span className="mono">on chain</span>
        </div>
        <div className="wg-doc-worked-row is-verdict">
          <span>Reproducible by a stranger with an RPC endpoint</span>
          <span className="mono">both ends</span>
          <span className="mono">yes</span>
        </div>
      </div>
      <p>
        The denominator is written by the program in the same instruction that moves the value,
        into an account at{" "}
        <code>[&quot;cohort&quot;, release_id, recipient]</code>, and it is never rewritten. It
        is not recomputed at measurement time, not re-priced, and not chosen later.
      </p>

      <h2>Why a cohort recorded afterwards would mean nothing</h2>
      <p>
        Reconstructing the denominator later means measuring a balance against a number
        somebody picked after seeing the balance. Any figure can be produced that way, which is
        exactly why this account is written at release rather than by an analytics job on
        Monday. That choice had to be made before the first payout; it cannot be retrofitted.
      </p>

      <h2>Three things it refuses to do</h2>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          <strong>It holds before anything has matured</strong>, and says when the figure will
          appear. A keep-rate quoted on day three is not a keep-rate.
        </p>
      </div>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          <strong>It holds when a matured cohort was never measured</strong>, rather than
          counting it as zero. &ldquo;They spent it all&rdquo; and &ldquo;we did not look&rdquo;
          are opposite claims, and conflating them moves the number in the safest possible
          direction for whoever is quoting it. That is the single easiest way a growth metric
          becomes a lie.
        </p>
      </div>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          <strong>It does not cap at 100%.</strong> A recipient who spent nothing can hold more
          than they were given when gold rises. Clamping would hide the asset doing exactly
          what this product says it does.
        </p>
      </div>

      <h2>What it does not claim</h2>
      <p>
        Keep-rate measures value still held, not intent, not satisfaction, and not whether
        somebody meant to sell. A person who spent their payout on rent is not a failure of the
        product — they are a person who was paid in something they could use. The number is
        useful because it separates a payout somebody kept from a payout designed to be dumped,
        and it stops being useful the moment it is asked to mean more than that.
      </p>

      <p>
        <Link href="/ledger">The figure, as it stands</Link> ·{" "}
        <Link href="/docs/receipts">What a receipt records</Link>
      </p>
    </DocFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { DocFrame } from "@/components/docs/doc-frame";

export const metadata: Metadata = {
  title: "Corporate actions",
  description:
    "Tokenized equities rebase balances through an on-chain multiplier. Store raw balances and a reinvested dividend reads as a gain and a four-for-one split as a 300% return. Here is exactly how Webgold avoids both.",
};

/**
 * THE MOAT, WRITTEN OUT.
 *
 * Every claim on this page is checkable against the SPYx mint account, and the numbers in the
 * worked examples are the ones in `reconcile.test.ts`. A doc page about correctness that
 * cannot itself be checked is marketing.
 */
export default function CorporateActionsPage() {
  return (
    <DocFrame
      here="/docs/corporate-actions"
      eyebrow="Docs"
      title="Why a dividend is not a gain."
      lede={
        <>
          Tokenized equities handle dividends and splits with an on-chain multiplier that
          rebases balances. Every product that stores raw balances and computes returns from
          them is wrong from the first ex-date. This is what Webgold does instead, and how to
          check it.
        </>
      }
    >
      <h2>The field that is not the multiplier</h2>
      <p>
        A Token-2022 <code>ScaledUiAmount</code> config carries two values and a timestamp: the
        older one in <code>multiplier</code>, the newer one in <code>newMultiplier</code>, and
        the moment the newer takes over. Read on mainnet on 12 September 2026, the SPYx mint
        held:
      </p>
      <div className="wg-doc-worked">
        <div className="wg-doc-worked-head">SPYx, read from the mint account</div>
        <div className="wg-doc-worked-row">
          <span>
            <code>multiplier</code>
          </span>
          <span className="mono">1.003909240011759</span>
          <span className="mono">stale</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>
            <code>newMultiplier</code>
          </span>
          <span className="mono">1.005714560286254</span>
          <span className="mono">live</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>
            <code>newMultiplierEffectiveTimestamp</code>
          </span>
          <span className="mono">1781755200</span>
          <span className="mono">18 Jun 2026</span>
        </div>
        <div className="wg-doc-worked-row is-verdict">
          <span>That timestamp is three months in the past</span>
          <span className="mono">0.18%</span>
          <span className="mono">short, forever</span>
        </div>
      </div>
      <p>
        An app that reads the field literally named <code>multiplier</code> paints every SPYx
        balance nearly two tenths of a percent short, permanently, and nothing about the number
        looks wrong. That is the corporate-action bug in its quietest form: not a crash, not a
        missing feed, a plausible number from the wrong field.
      </p>
      <div className="wg-doc-note">
        <Info size={16} strokeWidth={2} aria-hidden />
        <p>
          The issuer documentation says activation happens at 00:30 UTC. The one activation we
          have actually observed on chain is 04:00 UTC. Nothing in Webgold hardcodes an
          activation hour — the timestamp on the mint is the only authority, because a boundary
          we cannot verify would be an invented fact doing real work.
        </p>
      </div>

      <h2>Two rules, and everything follows from them</h2>
      <p>
        <strong>Adjusted quantity is always recomputed from the raw balance</strong>, never
        from the previously adjusted figure. Raw is what the chain holds and a corporate action
        does not change it; the multiplier is what changed. Recomputing from raw means a chain
        of ten reconciliations carries exactly one rounding step, and means running a
        reconciliation twice cannot move a balance.
      </p>
      <p>
        <strong>A multiplier change never moves cost basis</strong>, because basis here is
        dollars contributed from outside. A split brings in no dollars. A reinvested dividend
        brings in no dollars either — it converts value the position already held into more
        units of the same thing.
      </p>

      <h2>A reinvested dividend</h2>
      <div className="wg-doc-worked">
        <div className="wg-doc-worked-head">100 shares at $100, $2 per share reinvested</div>
        <div className="wg-doc-worked-row">
          <span>Before the ex-date</span>
          <span className="mono">100.0000 × $100</span>
          <span className="mono">$10,000.00</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>After: price falls by the dividend, multiplier rises</span>
          <span className="mono">102.0408 × $98</span>
          <span className="mono">$10,000.00</span>
        </div>
        <div className="wg-doc-worked-row is-verdict">
          <span>Return on the day</span>
          <span className="mono">0.00%</span>
          <span className="mono">correct</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>What a raw-balance product shows: 102.04 at the entry price</span>
          <span className="mono">102.0408 × $100</span>
          <span className="mono">+2.04%</span>
        </div>
      </div>
      <p>
        The dividend shows up as return later, when the price recovers — which is when it
        actually was one. Standard dividend-reinvestment accounting would add the reinvested
        $200 to basis and render the day as a <em>1.96% loss</em>, which is the mirror image of
        the bug and worse: nothing explains a loss on the day you earned something.
      </p>

      <h2>A four-for-one split</h2>
      <div className="wg-doc-worked">
        <div className="wg-doc-worked-head">100 shares at $200, split four for one</div>
        <div className="wg-doc-worked-row">
          <span>Before</span>
          <span className="mono">100.0000 × $200</span>
          <span className="mono">$20,000.00</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>After: quantity ×4, price ÷4</span>
          <span className="mono">400.0000 × $50</span>
          <span className="mono">$20,000.00</span>
        </div>
        <div className="wg-doc-worked-row is-verdict">
          <span>Return on the day</span>
          <span className="mono">0.00%</span>
          <span className="mono">correct</span>
        </div>
        <div className="wg-doc-worked-row">
          <span>What a raw-balance product shows: 400 at the entry price</span>
          <span className="mono">400.0000 × $200</span>
          <span className="mono">+300.00%</span>
        </div>
      </div>

      <h2>The same bug, arriving through the price</h2>
      <p>
        Pyth prices SPYx two ways: <code>Crypto.SPYX/USD</code> prices the token, which already
        carries the multiplier, and <code>Equity.US.SPY/USD</code> prices the underlying share,
        which does not. Multiplying the token price by an adjusted quantity applies the
        multiplier twice, and the result looks every bit as plausible as the right answer.
      </p>
      <p>
        So each asset declares which basis its feed is quoted in, and a live test asserts that
        the two paths agree: their ratio must equal the multiplier. Measured on 12 September,
        the implied figure was <code>1.006959</code> against a live <code>1.005714560286254</code>
        — twelve basis points apart, entirely explained by the equity feed being six hours
        staler than the token feed. Nothing but mainnet can establish that.
      </p>

      <h2>How to check any of this yourself</h2>
      <p>
        Read the SPYx mint account at{" "}
        <code>XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W</code> on any Solana RPC and unpack
        its Token-2022 extensions. Every number above comes from there, and nothing about it
        depends on Webgold being right.
      </p>
      <p>
        <Link href="/docs/receipts">How a receipt is checked</Link> ·{" "}
        <Link href="/assets">What a book can hold</Link>
      </p>
    </DocFrame>
  );
}

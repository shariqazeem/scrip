import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { usdc } from "@/lib/format";
import { plansSummary } from "@/lib/plan/read";

export const metadata: Metadata = {
  title: "For teams",
  description: "Pay people in USDC? Match what they save with a Plan the program enforces, or pay part of their pay in stock, straight to their own wallet, with a receipt that says why.",
};

/** A name carried in a saver's link: short, plain text, never markup. */
function cleanFrom(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/[^\p{L}\p{N} .@_…-]/gu, "").trim().slice(0, 32);
  return s.length >= 2 ? s : null;
}

/**
 * FOR TEAMS — where "ask whoever pays you to match it" lands.
 *
 * A saver's receipt sends their payer here with their name in `?from=`. The page says what a
 * team can do, in one signature each: match what its people save with a Plan the program
 * enforces, pay part of a payment in stock to the person's own wallet, pay a whole team in one
 * run, or grant stock that vests. A hand-paid amount is never called a match.
 */
export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const from = cleanFrom((await searchParams).from);
  const summary = await plansSummary();
  const live = summary.ok ? summary.value : null;
  return (
    <SiteFrame
      eyebrow="For teams"
      title="Pay people in USDC? Match what they save."
      lede={
        from ? (
          <>
            <strong>{from}</strong> saves part of what they are paid into stocks they own, with Scrip, and asked whether you would add to it. Here is
            what that takes: one signature, and a receipt that says why.
          </>
        ) : (
          "A Plan adds a share of every automatic save your people make, in stock, straight to their own wallets, capped each month and enforced by the program. Or pay part of a payment in stock, with a receipt that says why."
        )
      }
    >
      <SiteSection label="Match what they save, with a Plan" aside={live ? `${live.plans} live` : undefined}>
        <p className="sp-body">
          A Plan is a match the program enforces. You put stock into an escrow once; for every automatic save one of your people makes, the program
          adds a share of it in stock, straight to their own wallet, capped per person each month, in its own transaction right after their save.
          Saves made before someone joins are never matched. You can end a Plan whenever nobody is left in it and take back what is unspent; a match
          already paid is never taken back. <Link href="/app/org/plans">Start a Plan</Link>
        </p>
        {live && live.plans > 0 ? (
          <div className="sp-truths">
            <Row k="On Solana mainnet, read now">
              {live.plans} Plan{live.plans === 1 ? "" : "s"}, {live.members} member{live.members === 1 ? "" : "s"}, {live.matches} match{live.matches === 1 ? "" : "es"} paid,{" "}
              {usdc(live.matchedUsdc)} added in stock. <Link href="/ledger">Every receipt</Link>
            </Row>
          </div>
        ) : null}
      </SiteSection>
      <SiteSection label="Or pay part of their pay in stock">
        <div className="sp-truths">
          <Row k="Add stock to one person's pay">
            An address or a name, an amount, how much of it in stock, and a reason, like &ldquo;added to your October savings&rdquo;. It lands in their own wallet in the same
            transaction as the USDC part. <Link href="/app/org/pay">Pay someone in stock</Link>
          </Row>
          <Row k="Pay a whole team, in one run">Paste lines or upload a file: who, how much, how much in stock, why. Review every quote, sign once, and get one page that lists everyone with their receipt.</Row>
          <Row k="Grant stock that vests">Bought now, released on a schedule you set, from an escrow you cannot spend. <Link href="/grants">How grants work</Link></Row>
          <Row k="A record for the books">Every payment and grant as a file, with its transaction, for whoever keeps the accounts.</Row>
        </div>
      </SiteSection>
      <SiteSection label="Why stock">
        <ul>
          <li>
            <strong>It is kept.</strong> Saving that arrives with the paycheck is the kind that lasts: retirement saving rose from 37% to 86% of new hires
            once it became the default at work (Madrian &amp; Shea, 2001).
          </li>
          <li>
            <strong>It is one signature.</strong> The stock part and the cash part are one transaction, at any hour, with no minimum.
          </li>
          <li>
            <strong>It remembers why.</strong> The reason is on the receipt for good: &ldquo;added to your October savings&rdquo;, &ldquo;bounty: docs page&rdquo;, &ldquo;a year with the team&rdquo;.
          </li>
        </ul>
      </SiteSection>
      <SiteSection label="What it costs">
        <p className="sp-body">
          The network fee and the deposit for a permanent receipt, about 0.004 SOL a payment. Jupiter&rsquo;s route at 0.5% slippage; a route that would
          move the price more than 1% is refused. Scrip takes nothing today.
        </p>
      </SiteSection>
      <div className="sp-hero-cta">
        <Link href="/app/org/plans" className="sp-btn is-primary">
          Start a Plan
        </Link>
        <Link href="/app/org/pay" className="sp-btn">
          Pay someone in stock
        </Link>
      </div>
    </SiteFrame>
  );
}

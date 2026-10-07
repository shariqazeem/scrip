import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";

export const metadata: Metadata = {
  title: "For teams",
  description: "Pay people in USDC? Add stock to what they save: pay part of their pay in stock, straight to their own wallet, with a receipt that says why.",
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
 * team can do today, in one signature each: pay part of a payment in stock to the person's
 * own wallet, pay a whole team in one run, or grant stock that vests. It says plainly that a
 * program-enforced match (a Plan) is in development, and never calls a hand-paid amount a match.
 */
export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const from = cleanFrom((await searchParams).from);
  return (
    <SiteFrame
      eyebrow="For teams"
      title="Pay people in USDC? Add stock to what they save."
      lede={
        from ? (
          <>
            <strong>{from}</strong> saves part of what they are paid into stocks they own, with Scrip, and asked whether you would add to it. Here is
            what that takes: one signature, and a receipt that says why.
          </>
        ) : (
          "Pay part of a payment in stock, straight to the person's own wallet, with a receipt that says why. One person or a whole team, in one signature. No brokerage account on either side."
        )
      }
    >
      <SiteSection label="What a team can do today">
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
      <SiteSection label="Plans, in development">
        <p className="sp-body">
          A Plan will be a match the program enforces: you fund an escrow once, and for every automatic save your people make, the program adds a
          share in stock, capped per person each month, with a receipt each time. You can end a Plan whenever you like; you can never take back a
          match already paid. It is being built and tested now. Until it ships, adding stock by hand is the way, and Scrip never calls that a match.
        </p>
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
          move the price more than 1% is refused. Scrip takes nothing.
        </p>
      </SiteSection>
      <div className="sp-hero-cta">
        <Link href="/app/org/pay" className="sp-btn is-primary">
          Pay someone in stock
        </Link>
        <Link href="/@scrip" className="sp-btn">
          See how Scrip pays
        </Link>
      </div>
    </SiteFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import bounties from "@/../content/bounties.json";

export const metadata: Metadata = { title: "Bounties, paid in stock", description: "Scrip's own bounties: real micro-tasks paid in SPYx through Scrip's organisation page, every payment on the ledger." };

type Bounty = { id: string; title: string; reward: number; asset: string; status: string; how: string };

export default function BountiesPage() {
  const list = (bounties as { bounties: Bounty[] }).bounties;
  const open = list.filter((b) => b.status === "open");
  const closed = list.filter((b) => b.status !== "open");
  return (
    <SiteFrame eyebrow="Bounties" title="Small work, paid in stock." lede={<>Real micro-tasks, paid in SPYx through Scrip&rsquo;s own organisation page. Every payment is on <Link href="/@scrip" className="sp-inline-link">@scrip</Link>, labelled as Scrip&rsquo;s. Do one, send the proof, and the receipt prints with the reason on it.</>}>
      <SiteSection label="Open" aside={`${open.length}`}>
        <div className="sp-truths">
          {open.map((b) => (
            <Row key={b.id} k={`$${b.reward} in ${b.asset}`}>
              <strong>{b.title}.</strong> {b.how}
            </Row>
          ))}
        </div>
      </SiteSection>
      {closed.length > 0 ? (
        <SiteSection label="Paid">
          <div className="sp-truths">
            {closed.map((b) => (
              <Row key={b.id} k={`$${b.reward} in ${b.asset}`}>
                <strong>{b.title}.</strong> paid
              </Row>
            ))}
          </div>
        </SiteSection>
      ) : null}
      <SiteSection label="How to claim one">
        <ul>
          <li>Open a register at <Link href="/app/rule">/app/rule</Link> so the payment lands in your own wallet; an address with no register gets a claim link instead.</li>
          <li>Do the work. Send the proof and your handle to the founder, whose address is on <Link href="/@scrip">@scrip</Link>.</li>
          <li>The payment is a normal Scrip payment in stock: one transaction, a receipt with the bounty&rsquo;s name as the reason, on the ledger for anyone to open.</li>
        </ul>
      </SiteSection>
    </SiteFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";

export const metadata: Metadata = { title: "Company", description: "Scrip is where income becomes ownership. The manifesto, the seven firsts, and who builds this." };

const FIRSTS = [
  ["A stock can be paid", "Pay in stock; the rule", "/teams"],
  ["A stock can obey a rule on an address", "The rule", "/people"],
  ["A stock can remember why it arrived", "The receipt with a reason", "/docs/receipts"],
  ["A stock can vest from anyone to anyone", "Grants", "/grants"],
  ["A stock can arrive before the opening bell", "The clock on the floor", "/#floor"],
  ["A stock can be given, and claimed into any wallet", "Claim links", "/teams"],
  ["A stock can prove it was kept", "Keep-rate on chain", "/docs/keep-rate"],
] as const;

export default function CompanyPage() {
  return (
    <SiteFrame eyebrow="Company" title="Scrip is where income becomes ownership." lede="Since the first stock exchange, being paid in ownership was for employees of public companies with brokerage accounts. Now a stock is a token that can be paid, ruled, given, vested and remembered like money.">
      <SiteSection label="The name">
        <p className="sp-body">A scrip is a certificate entitling its holder to shares, and “paid in scrip” is the old phrase for being paid in something other than cash. There is no better word for a company where income becomes stock certificates.</p>
      </SiteSection>
      <SiteSection label="The seven firsts" aside="each one on the floor">
        <div className="sp-truths">
          {FIRSTS.map(([first, where, href], i) => (
            <Row key={first} k={`0${i + 1}`}>
              <strong>{first}.</strong> Shown by <Link href={href}>{where}</Link>.
            </Row>
          ))}
        </div>
      </SiteSection>
      <SiteSection label="What it is not">
        <p className="sp-body">Not a trading terminal, a robo-advisor, a lender, a card, a social feed, a launchpad, or a brokerage. It gives no advice. It never decides amounts: the rate is the owner&rsquo;s, the price is Jupiter&rsquo;s route bounded by Pyth, the timing is arrival.</p>
      </SiteSection>
      <SiteSection label="Who builds this">
        <p className="sp-body">Shariq, and the keepers. The founder&rsquo;s own rule runs on the wallet he is paid to, and Scrip pays its own bounties in stock through <Link href="/@scrip" className="sp-inline-link">@scrip</Link>. Every payment Scrip makes is on that page, labelled as Scrip&rsquo;s.</p>
      </SiteSection>
      <SiteSection label="Where it goes">
        <p className="sp-body">Rules on income. A stock slice is the first rule; the same standing instruction later routes a slice into a mix, a reserve or a set-aside, for a person, a grant program or an agent&rsquo;s treasury. Each step is the rule with one more destination, never a new product.</p>
      </SiteSection>
      <div className="sp-hero-cta">
        <Link href="/security" className="sp-btn">
          Security
        </Link>
        <Link href="/bounties" className="sp-btn">
          Bounties, paid in stock
        </Link>
        <Link href="/changelog" className="sp-btn">
          Changelog
        </Link>
      </div>
    </SiteFrame>
  );
}

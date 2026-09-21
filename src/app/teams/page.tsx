import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";

export const metadata: Metadata = { title: "For teams", description: "Pay one person or a whole team in stock: a slice or all of each payment, with a receipt that carries the reason, and a public page that recruits." };

export default function TeamsPage() {
  return (
    <SiteFrame eyebrow="For teams" title="Pay in stock. One person, or a whole run." lede="A slice or all of each payment becomes S&P 500 in the recipient's own wallet, with a receipt that carries the reason forever. The rest lands as USDC in the same transaction. A run pays a team in one signature and gives you a page that lists everyone with their receipt.">
      <SiteSection label="What an organisation can do">
        <div className="sp-truths">
          <Row k="Pay one">A handle or an address, an amount, the split, a reason. An address with no register gets a claim link and a first share waiting.</Row>
          <Row k="Pay many, in a run">Paste lines or upload a CSV: handle, amount, stock share, reason. Review every quote, sign once, and get a run page — a payslip for a team.</Row>
          <Row k="Grant stock that vests">Bought now, releasing on a schedule you set. The retention instrument public companies have, in any listed company, for anyone with a wallet. <Link href="/grants">How grants work.</Link></Row>
          <Row k="A page that recruits">“Pays in stock since September 2026.” People paid, stock delivered, grants vesting, the last run. Recipients are named only where they published their own register.</Row>
          <Row k="Exports">CSV of every payment and grant with signatures, for whoever does the books.</Row>
        </div>
      </SiteSection>
      <SiteSection label="Why pay in stock">
        <ul>
          <li>
            <strong>It recruits.</strong> Every payment gives the recipient a register with a receipt on it. The invisible rule needed a visible channel; this is it.
          </li>
          <li>
            <strong>It is one signature.</strong> The stock part and the cash part are one transaction. No brokerage account on either side, no market hours, no minimum.
          </li>
          <li>
            <strong>It remembers.</strong> The reason is on the receipt forever: “September retainer”, “bounty: docs page”, “retention: keeper for a quarter”.
          </li>
        </ul>
      </SiteSection>
      <SiteSection label="What it costs">
        <p className="sp-body">Network fees and a permanent receipt&rsquo;s rent, about 0.004 SOL a payment. Jupiter&rsquo;s route at 0.5% slippage; a route moving the price more than 1% is refused. Scrip takes nothing.</p>
      </SiteSection>
      <div className="sp-hero-cta">
        <Link href="/app/org" className="sp-btn is-primary">
          Open an organisation register
        </Link>
        <Link href="/@scrip" className="sp-btn">
          See how Scrip pays
        </Link>
      </div>
    </SiteFrame>
  );
}

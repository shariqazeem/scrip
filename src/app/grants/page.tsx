import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";

export const metadata: Metadata = { title: "Grants that vest", description: "Stock bought now that vests on a schedule, from anyone to anyone, in any listed company: RSUs for anyone with a wallet." };

export default function GrantsPage() {
  return (
    <SiteFrame eyebrow="Grants" title="Stock that vests. From anyone, to anyone." lede="Since the first stock exchange, a vesting grant was for employees of public companies with brokerage accounts. Now the stock is a token: any organisation can grant any listed company to anyone with a wallet, on a schedule the program keeps.">
      <SiteSection label="How a grant works">
        <div className="sp-truths">
          <Row k="Bought now">The payer buys the stock at grant time; it sits in an escrow the grant itself owns. The recipient can see it. The payer cannot spend it.</Row>
          <Row k="A cliff, then linear">Nothing vests before the cliff; after it, raw units release linearly over the duration, or all at once when there is no duration.</Row>
          <Row k="Keepers vest it">Anyone may call vest; the caller is repaid the receipt&rsquo;s rent and a fixed tip from the grant&rsquo;s float. Every vest writes a receipt.</Row>
          <Row k="Revocable, if the payer chose">What has not accrued returns to the payer; what had accrued stays claimable by the recipient, receipt and all.</Row>
          <Row k="While it vests, dividends reinvest into it">Vesting is computed on raw units, so a dividend reinvested through the multiplier while the stock waits goes to whoever the units vest to.</Row>
        </div>
      </SiteSection>
      <SiteSection label="What the program enforces">
        <pre>{`open_grant     payer · creates the Grant and its escrow; the recipient's own account too
  route        Jupiter, USDC → the asset, destination = the escrow
seal_grant     payer, same transaction · escrow ≥ the payer's own minimum; total fixed; float deposited; receipt
vest           anyone · releasable = total × clamp((now − start − cliff) / duration) − released; receipt; tip repaid
revoke_grant   payer · unvested back; accrued stays claimable; state Revoked
close_grant    payer · completed or revoked, escrow empty; rent and float back`}</pre>
      </SiteSection>
      <SiteSection label="The honest sentence">
        <p className="sp-body">Scrip holds an asset only in an escrow the payer created, that the recipient can see, and that the payer cannot spend. A grant is that escrow with a schedule. Nobody has reviewed the legal shape of a vesting grant of securities-backed tokens executed by third-party keepers; <Link href="/security" className="sp-inline-link">the security page says so.</Link></p>
      </SiteSection>
      <div className="sp-hero-cta">
        <Link href="/app/org/grants" className="sp-btn is-primary">
          Grant stock that vests
        </Link>
        <Link href="/ledger" className="sp-btn">
          Grants on the ledger
        </Link>
      </div>
    </SiteFrame>
  );
}

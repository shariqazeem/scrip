import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { ExampleStub } from "@/components/stub/stub";

export const metadata: Metadata = { title: "For people", description: "A rule on the wallet you already get paid to: a slice of every USDC that lands becomes S&P 500, with a receipt." };

export default function PeoplePage() {
  return (
    <SiteFrame eyebrow="For people" title="Set a rate once. Then get paid." lede="A rule on the address you already get paid to. A slice of every USDC that lands becomes S&P 500 in the same wallet, seconds later, with a receipt anyone can open. Payers never open Scrip.">
      <SiteSection label="The five-second version">
        <div style={{ maxWidth: 440 }}>
          <ExampleStub />
        </div>
      </SiteSection>
      <SiteSection label="How it works">
        <div className="sp-truths">
          <Row k="Choose a rate">Five, ten or twenty percent, or another. One signature approves your own register as a delegate on your USDC account, with an allowance you set.</Row>
          <Row k="Money lands">A client, a grant, a bounty, a friend: they send USDC to your address the way they always have. A keeper notices the balance rose.</Row>
          <Row k="Stock arrives, with a receipt">One atomic transaction moves exactly the slice, swaps it, checks the fill against Pyth, and writes a permanent receipt. If any step fails, nothing moves.</Row>
          <Row k="Pause is a revoke">Revoking the delegate is a token-program instruction on your own account. Scrip cannot prevent, delay or reverse it.</Row>
        </div>
      </SiteSection>
      <SiteSection label="What you get back">
        <ul>
          <li>
            <strong>A register.</strong> Every arrival with its receipt, a staircase of ownership, and monthly statements you can print.
          </li>
          <li>
            <strong>A message when a stub prints.</strong> Telegram first: “$200 landed. $20 became 0.0262 SPYx.” Tap it to open the receipt.
          </li>
          <li>
            <strong>A public page, if you want one.</strong> A proof of saving at <span className="mono">/@you</span>, with the keep-rate the chain measured.
          </li>
        </ul>
      </SiteSection>
      <SiteSection label="Before you ask">
        <div className="sp-truths">
          <Row k="Not our custody">Your USDC and your stock sit in token accounts you own. Scrip holds a rule and writes receipts.</Row>
          <Row k="The issuer can move these tokens">xStocks are tracker certificates issued by Backed, with a permanent delegate and a pause authority. Not offered to US persons.</Row>
          <Row k="Dividends are reinvested, not paid">They arrive as a mint-level multiplier. Scrip never shows an expected income.</Row>
          <Row k="Savings-grade, not stable">Equities fall as well as rise. Scrip competes for the position that sits idle, never for your cash.</Row>
        </div>
      </SiteSection>
      <div className="sp-hero-cta">
        <Link href="/app/rule" className="sp-btn is-primary">
          Turn on the rule
        </Link>
        <Link href="/docs/how-the-rule-sees-money" className="sp-btn">
          How the rule sees money
        </Link>
      </div>
    </SiteFrame>
  );
}

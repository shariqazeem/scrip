import Link from "next/link";
import { HomeNav } from "@/components/site/home-nav";
import { StartCard } from "@/components/start/start-card";
import { RealSave } from "@/components/start/real-save";
import { Stub } from "@/components/stub/stub";
import { stampUTC, unitsFromRaw, usdc } from "@/lib/format";
import { frontReceipt, strangersSaving } from "@/lib/save/latest";
import { startCardProps } from "@/lib/start/card";
import "./front.css";

// Nothing here depends on who is asking (the nav reads the session after it mounts), so the page
// is built once and refreshed every 30 seconds: a visitor gets it from the cache instead of
// waiting on prices, a quote and the receipt cache, which cost 1.9 s on every request.
// The reads below use uncached fetches (prices must never be stale inside a transaction), which would
// make the page render per request; force-static keeps the 30-second cache for this page alone.
export const dynamic = "force-static";
export const revalidate = 30;

/**
 * THE FRONT DOOR HAS ONE JOB: START SAVING — AND SHOW WHAT THAT MEANS.
 *
 * Left, one sentence a person can answer: "Save 10% of every payment, into the Nasdaq 100", and
 * one button. Right, a real automatic save read from mainnet, the way a wallet would show it: a
 * payment landing, the slice the rule took by itself seconds later, the stock arriving in the
 * same wallet, and a sponsor's match. Until 9 October the right was a tall form whose first save
 * was a plain swap, and the founder, using it: "it feels like just a swap … boring … confusing".
 * The machine stays at /proof; what stays here is the product, its evidence and its honesty.
 */
export default async function FrontDoor() {
  const [card, receipt, strangers] = await Promise.all([startCardProps(), frontReceipt(), strangersSaving()]);

  return (
    <div className="sp-home">
      <HomeNav front />

      <header className="sp-home-hero is-sentence">
        <div className="sp-home-hero-copy">
          <h1 className="sp-home-display">Your income invests itself.</h1>
          <p className="sp-home-lede">A slice of every USDC payment you receive becomes stock in your own wallet, by itself, seconds after it lands.</p>
          <div className="sp-home-start" aria-label="Start saving">
            <StartCard {...card} />
          </div>
          <p className="sp-home-once">
            Just want to save once? <Link href="/app/save">Save without the automatic part</Link>.
          </p>
        </div>
        <div className="sp-home-hero-real">
          {receipt && receipt.kind === "sweep" ? (
            <RealSave r={receipt} />
          ) : receipt ? (
            <Stub
              compact
              href={`/receipt/${receipt.sig}`}
              kicker="Saved on Solana"
              tag={receipt.tag}
              landed={
                <>
                  <strong>{usdc(receipt.paidUsdc)}</strong> saved
                </>
              }
              became="It became"
              units={unitsFromRaw(receipt.amountRaw, receipt.decimals)}
              symbol={receipt.name}
              when={stampUTC(receipt.settledUnix)}
            />
          ) : null}
          {strangers > 0 ? (
            <p className="sp-home-strangers">
              {strangers} {strangers === 1 ? "person" : "people"} outside the team {strangers === 1 ? "is" : "are"} saving with Scrip.{" "}
              <Link href="/ledger" className="sp-home-link">
                See every receipt
              </Link>
            </p>
          ) : null}
        </div>
      </header>

      <section className="sp-home-sec" aria-labelledby="teams">
        <h2 id="teams" className="sp-home-h2">
          Whoever pays you can add to it.
        </h2>
        <p className="sp-home-body">
          A team that pays people in USDC can match what they save with a Plan the program enforces: a share of every automatic save, in stock,
          straight to their wallets, capped each month and never taken back. Or pay part of their pay in stock, with a receipt that says why.
        </p>
        <Link href="/teams" className="sp-home-btn">
          Scrip for teams
        </Link>
      </section>

      <section className="sp-home-sec" aria-labelledby="why">
        <h2 id="why" className="sp-home-h2">
          Why once is enough.
        </h2>
        <p className="sp-home-body">
          Saving works when nobody has to decide it again. Say yes once, and every payment saves its slice before anyone has a chance to forget.
        </p>
        <div className="sp-home-evidence">
          <figure>
            <p className="big">37% → 86%</p>
            <figcaption>Workers saving for retirement, once saving became the default at work (Madrian &amp; Shea, 2001).</figcaption>
          </figure>
          <figure>
            <p className="big">3.5% → 13.6%</p>
            <figcaption>How much people saved, when increases were set in advance instead of decided each time (Thaler &amp; Benartzi, 2004).</figcaption>
          </figure>
        </div>
      </section>

      <section className="sp-home-sec" aria-labelledby="before">
        <h2 id="before" className="sp-home-h2">
          Before you save
        </h2>
        <dl className="sp-home-rows">
          <div>
            <dt>Not our custody</dt>
            <dd>Your USDC and your stock sit in your own wallet. Scrip never holds either, and cannot move your stock.</dd>
          </div>
          <div>
            <dt>Issuers can freeze or move these tokens</dt>
            <dd>
              Tokenized stocks are issued by xStocks (Backed), Ondo or Backpack, and most issuers can freeze or move their tokens. Each save
              says what its issuer can do before you sign. Not offered to US persons.
            </dd>
          </div>
          <div>
            <dt>Dividends are reinvested</dt>
            <dd>These tokens reinvest dividends instead of paying them out. Scrip never shows an expected income.</dd>
          </div>
          <div>
            <dt>Stocks go down as well as up</dt>
            <dd>Save what you can leave alone. Scrip is for the part of your pay you want to keep, not the part you need this month.</dd>
          </div>
        </dl>
        <p className="sp-home-body">
          How it works, with every number read from the chain: <Link href="/proof" className="sp-home-link">see the proof</Link>.
        </p>
      </section>

      <footer className="sp-home-foot">
        <span>Scrip</span>
        <span className="sp-home-nav-spacer" />
        <Link href="/app">Your savings</Link>
        <Link href="/proof">Proof</Link>
        <Link href="/teams">For teams</Link>
        <Link href="/security">Security</Link>
        <Link href="/assets">Assets</Link>
        <Link href="/docs">Docs</Link>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { HomeNav } from "@/components/site/home-nav";
import { StartCard } from "@/components/start/start-card";
import { RealSave } from "@/components/start/real-save";
import { Stub } from "@/components/stub/stub";
import { stampUTC, unitsFromRaw, usdc } from "@/lib/format";
import { MoneyTrail } from "@/app/curve/trail";
import { curveCounts } from "@/lib/curve/read";
import { plansSummary } from "@/lib/plan/read";
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
 *
 * Then the whole of Scrip, since 10 October: the three ways stock reaches a saver (every payment,
 * whoever pays them, every launch on Scrip Curve), each with what is on mainnet now, and Scrip
 * Curve's money trail. The founder: "include it as part of scrip … instead of whats now which is
 * slice of stock just". The machine stays at /proof; what stays here is the product, its
 * evidence and its honesty.
 */
export default async function FrontDoor() {
  const [card, receipt, strangers, plans, curve] = await Promise.all([startCardProps(), frontReceipt(), strangersSaving(), plansSummary(), curveCounts()]);
  const live = plans.ok ? plans.value : null;

  return (
    <div className="sp-home">
      <HomeNav front />

      <header className="sp-home-hero is-sentence">
        <div className="sp-home-hero-copy">
          <h1 className="sp-home-display">Your income invests itself.</h1>
          <p className="sp-home-lede">
            A slice of every USDC payment you receive becomes stock in your own wallet, by itself. Whoever pays you can match it, and so can
            every token launched on Scrip Curve, out of its trading fees.
          </p>
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

      <section className="sp-home-sec" aria-labelledby="ways">
        <h2 id="ways" className="sp-home-h2">
          Three ways stock reaches you.
        </h2>
        <p className="sp-home-body">Each one ends the same way: stock in your own wallet, on a receipt anyone can open.</p>
        <ol className="sp-home-ways">
          <li>
            <span className="n">From every payment you receive</span>
            <p className="p">
              Say yes once, and a slice of every USDC payment becomes stock seconds after it lands. The program checks each save against a
              price Pyth verified, or nothing moves.
            </p>
            <p className="f">On mainnet since 21 September 2026.</p>
            <Link href="/ledger" className="go">
              Every receipt so far
            </Link>
          </li>
          <li>
            <span className="n">From whoever pays you</span>
            <p className="p">
              A Plan adds a share of every automatic save its people make, in stock, from an escrow the program holds, capped each month and
              never taken back.
            </p>
            {live && live.plans > 0 ? (
              <p className="f">
                On mainnet now: {live.plans} Plan{live.plans === 1 ? "" : "s"}, {live.matches} match{live.matches === 1 ? "" : "es"} paid.
              </p>
            ) : null}
            <Link href="/teams" className="go">
              Scrip for teams
            </Link>
          </li>
          <li>
            <span className="n">From every trade on a launch</span>
            <p className="p">
              Scrip Curve launches tokens on Meteora priced in a stock. Every trading fee is that stock, and the savers&rsquo; share goes straight
              into a Plan in it, which adds it to people&rsquo;s automatic saves.
            </p>
            {curve && curve.launches > 0 ? (
              <p className="f">
                On mainnet now: {curve.launches} launch{curve.launches === 1 ? "" : "es"}, {curve.fees} fee{curve.fees === 1 ? "" : "s"} paid into a Plan.
              </p>
            ) : null}
            <Link href="/curve" className="go">
              Scrip Curve
            </Link>
          </li>
        </ol>
      </section>

      <section className="sp-home-sec" aria-labelledby="curve">
        <div className="sp-home-split">
          <div>
            <h2 id="curve" className="sp-home-h2">
              Launch a token that pays savers.
            </h2>
            <p className="sp-home-body">
              Pick the stock it is priced in: the Nasdaq 100, the S&amp;P 500, Tesla or Nvidia. Name it and sign once. Every buy pays in that
              stock. The fee starts at 25% and falls to 1% over the first hour, so a bot that buys first pays savers. At graduation the pool
              moves to Meteora&rsquo;s DAMM v2 with every position locked for good, and its fees keep reaching savers.
            </p>
            <div className="sp-home-actions">
              <Link href="/curve/launch" className="sp-home-btn">
                Launch a token
              </Link>
              <Link href="/curve" className="sp-home-btn">
                See every launch
              </Link>
            </div>
            <p className="sp-home-small">
              A launch is a speculative token, not a stock and not a share of one, and it belongs to whoever launched it. Scrip makes no claim
              about any launch&rsquo;s price, only about where its fees go. Not offered to US persons.
            </p>
          </div>
          <MoneyTrail />
        </div>
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
        <Link href="/teams">For teams</Link>
        <Link href="/curve">Launches</Link>
        <Link href="/proof">Proof</Link>
        <Link href="/security">Security</Link>
        <Link href="/assets">Assets</Link>
        <Link href="/docs">Docs</Link>
      </footer>
    </div>
  );
}

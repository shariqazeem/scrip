import Link from "next/link";
import { HomeNav } from "@/components/site/home-nav";
import { StartCard } from "@/components/start/start-card";
import { Stub } from "@/components/stub/stub";
import { bps, stampUTC, unitsFromRaw, usdc } from "@/lib/format";
import { frontReceipt } from "@/lib/save/latest";
import { startCardProps } from "@/lib/start/card";
import "./front.css";

export const dynamic = "force-dynamic";

/**
 * THE FRONT DOOR HAS ONE JOB: START SAVING.
 *
 * One card, one question — how much of every payment becomes stock — and one button that
 * asks the wallet twice at most: to sign in, then to approve turning every payment on, a
 * first save so stock lands today, and any Plan a sponsor invited the wallet to. Until
 * 8 October this was three journeys: save now here, "every payment" on its own page behind
 * its own sign-in, and a Plan's invitation accepted somewhere else, five wallet prompts in
 * all. The founder, using it with money in his wallet: "so many steps … why would anyone".
 *
 * Everything that proves how it works moved to /proof long ago; what stays is the receipt,
 * the evidence for defaults, the match, and what is true of the tokens.
 */
export default async function FrontDoor() {
  const [card, receipt] = await Promise.all([startCardProps(), frontReceipt()]);

  return (
    <div className="sp-home">
      <HomeNav />

      <header className="sp-home-hero">
        <div className="sp-home-hero-copy">
          <h1 className="sp-home-display">Your income invests itself.</h1>
          <p className="sp-home-lede">A slice of every USDC payment you receive becomes stock you own, in your own wallet. Set it once.</p>
          <ul className="sp-home-points">
            <li>The Nasdaq 100, Tesla or gold, by itself, as each payment lands.</li>
            <li>Whoever pays you keeps paying you exactly as they do now.</li>
            <li>Your wallet, never ours. Stop any time, in one tap.</li>
          </ul>
        </div>
        <section className="sp-home-card" aria-label="Start saving">
          <StartCard {...card} />
          <p className="sp-home-once">
            Just want to save once? <Link href="/app/save">Save without the automatic part</Link>.
          </p>
        </section>
      </header>

      {receipt ? (
        <section className="sp-home-sec sp-home-receipt" aria-labelledby="real">
          <div>
            <h2 id="real" className="sp-home-h2">
              A real receipt
            </h2>
            <p className="sp-home-body">
              {receipt.kind === "save"
                ? "The latest save on Scrip, read from Solana mainnet. Open it and every figure links to the transaction it came from."
                : "The latest automatic save on Scrip: USDC arrived, the slice became stock in the same wallet, and the program wrote this receipt. Every figure links to the chain."}
            </p>
            <p className="sp-home-body">
              <Link href={`/receipt/${receipt.sig}`} className="sp-home-link">
                Open the receipt
              </Link>
            </p>
          </div>
          <Stub
            compact
            href={`/receipt/${receipt.sig}`}
            kicker={receipt.kind === "save" ? "Saved on Solana" : "Saved automatically"}
            tag={receipt.team ? "team" : undefined}
            landed={
              receipt.kind === "save" ? (
                <>
                  <strong>{usdc(receipt.paidUsdc)}</strong> saved
                </>
              ) : (
                <>
                  <strong>{usdc(receipt.basisUsdc ?? 0n)}</strong> arrived
                </>
              )
            }
            became={receipt.kind === "save" ? "It became" : `${bps(receipt.rateBps ?? 0)} of it became`}
            units={unitsFromRaw(receipt.amountRaw, receipt.decimals)}
            symbol={receipt.name}
            when={stampUTC(receipt.settledUnix)}
          />
        </section>
      ) : null}

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

import Link from "next/link";
import { SaveNow } from "@/components/save/save-now";
import { HomeNav } from "@/components/site/home-nav";
import { Stub } from "@/components/stub/stub";
import { bps, stampUTC, unitsFromRaw, usdc } from "@/lib/format";
import { type AutomaticToday, automaticToday, listOf, saveCardProps } from "@/lib/save/card";
import { frontReceipt } from "@/lib/save/latest";
import "./front.css";
import "@/components/save/save.css";

export const dynamic = "force-dynamic";

/**
 * THE FRONT DOOR HAS ONE JOB: SAVE PART OF WHAT YOU WERE PAID.
 *
 * The final plan (7 October): a person meets the save first, a receipt in seconds, and only
 * then the two asks that only Scrip has, which are "do this with every payment" and "ask
 * whoever pays you to match it". Everything that proves how it works (the floor, the tape,
 * the keepers, the replayed sweep, the counters) moved to /proof, on ink. This page is paper,
 * one primary button, and nothing a stranger has to decode.
 */
export default async function FrontDoor() {
  const [card, receipt, auto] = await Promise.all([saveCardProps(), frontReceipt(), automaticToday()]);
  const count = card.stocks.length;

  return (
    <div className="sp-home">
      <HomeNav />

      <header className="sp-home-hero">
        <div className="sp-home-hero-copy">
          <h1 className="sp-home-display">Your income invests itself.</h1>
          <p className="sp-home-lede">Turn part of the USDC in your wallet into stocks you own, then save a slice of every payment by itself.</p>
          <ul className="sp-home-points">
            <li>Into the Nasdaq 100, the S&amp;P 500, Nvidia and {count - 3} more, in your own wallet.</li>
            <li>One signature, and a receipt in seconds.</li>
            <li>Weekends too: a save is a swap, not an order that waits for a market.</li>
          </ul>
        </div>
        <section className="sp-home-card" aria-label="Save now">
          <SaveNow {...card} />
        </section>
      </header>

      <section className="sp-home-sec" aria-labelledby="how">
        <h2 id="how" className="sp-home-h2">
          How Scrip works
        </h2>
        <ol className="sp-home-steps">
          <li>
            <span className="n" aria-hidden>
              1
            </span>
            <p className="t">Save now</p>
            <p className="p">Turn some of the USDC in your wallet into a stock you own. One signature, and a receipt in seconds.</p>
            <a href="#save" className="sp-home-btn is-primary">
              Save $5
            </a>
          </li>
          <li>
            <span className="n" aria-hidden>
              2
            </span>
            <p className="t">Save every payment</p>
            <p className="p">Say yes once, and 10% of every USDC payment into your wallet is saved the same way, by itself. Stop any time.</p>
            <Link href="/app/rule" className="sp-home-btn">
              Set it up
            </Link>
          </li>
          <li>
            <span className="n" aria-hidden>
              3
            </span>
            <p className="t">Watch it add up</p>
            <p className="p">Every stock and every receipt in one place, and whoever pays you can add stock to it.</p>
            <Link href="/app" className="sp-home-btn">
              Open your savings
            </Link>
          </li>
        </ol>
      </section>

      <section className="sp-home-sec" aria-labelledby="promise">
        <h2 id="promise" className="sp-home-h2">
          What you can count on
        </h2>
        <div className="sp-home-three">
          <div>
            <p className="t">Your stock lands in your own wallet.</p>
            <p className="p">A save is one transaction you sign, from your wallet to your wallet. Scrip never holds your money or your stock.</p>
          </div>
          <div>
            <p className="t">You see the cost before you sign.</p>
            <p className="p">The price, the least you will get, and the network fee in cents. If the price moves past what you saw, the save simply does not happen.</p>
          </div>
          <div>
            <p className="t">Every save prints a receipt.</p>
            <p className="p">A public page built from the transaction itself: what you paid, what you got, the route it took, and the time.</p>
          </div>
        </div>
      </section>

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

      <section className="sp-home-sec" aria-labelledby="every">
        <h2 id="every" className="sp-home-h2">
          Then make it automatic.
        </h2>
        <p className="sp-home-body">
          Say yes once, and 10% of every USDC payment into your wallet becomes stock in the same wallet. Scrip can move at most the limit you set,
          $200 to start, and you can stop any time.
        </p>
        <AutomaticNote auto={auto} />
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
        <Link href="/app/rule" className="sp-home-btn is-primary">
          Save 10% of every payment
        </Link>
      </section>

      <section className="sp-home-sec" aria-labelledby="teams">
        <h2 id="teams" className="sp-home-h2">
          Whoever pays you can add to it.
        </h2>
        <p className="sp-home-body">
          A team that pays people in USDC can pay part of it in stock, or add stock to what they save, straight to their wallets, with a receipt
          that says why.
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

/**
 * WHICH STOCKS SAVE AUTOMATICALLY TODAY, in the chain's own numbers. An automatic save settles
 * only against a price Scrip can verify on Solana; the page names exactly the stocks that have
 * one right now, and when none does, how old the newest price is. Nothing when the chain could
 * not be asked: an unknown is not a "no".
 */
function AutomaticNote({ auto }: { auto: AutomaticToday }) {
  if (!auto.known) return null;
  if (auto.settling.length === 0) {
    return (
      <p className="sp-home-wait">
        <strong>Right now automatic saves are waiting.</strong> Scrip settles one only against a price it can verify on Solana, and the newest one
        there is {auto.newestWait ?? "days"} old. Until a price returns, payments you receive stay in your wallet as USDC: nothing is lost and nothing
        is guessed. Saving now, above, works at any time.
      </p>
    );
  }
  return (
    <p className="sp-home-note">
      Automatic saves settle only against a price Scrip can verify on Solana. Right now that is the {listOf(auto.settling)}. Other stocks wait
      for a price, and payments meant for them stay in your wallet as USDC until one returns. Saving now, above, works with every stock at any
      time.
    </p>
  );
}

import Link from "next/link";
import { SaveNow } from "@/components/save/save-now";
import { HomeNav } from "@/components/site/home-nav";
import type { QuoteBody } from "@/components/save/types";
import { Stub } from "@/components/stub/stub";
import { bps, stampUTC, unitsFromRaw, usdc } from "@/lib/format";
import { CATALOGUE_READ_AT, catalogue, defaultStock, disclosure, featured, toPicker } from "@/lib/save/catalogue";
import { frontReceipt } from "@/lib/save/latest";
import { cachedQuote } from "@/lib/save/quote-cache";
import { offeredAssets } from "@/lib/assets/registry";
import { nameOf } from "@/lib/save/names";
import { waitedFor } from "@/lib/pyth/price";
import { priceStates } from "@/lib/pyth/ready";
import { cluster } from "@/lib/solana/cluster";
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
  const stock = defaultStock();
  const offered = offeredAssets();
  const [quote, receipt, states] = await Promise.all([cachedQuote(stock, 5_000_000n, null), frontReceipt(), priceStates(offered)]);
  // Which of the eleven can settle an automatic save right now, by name.
  const settlingNow = offered.filter((_, i) => states[i]!.ready === true).map((a) => nameOf(a.symbol));
  const at = offered.findIndex((a) => a.mint === stock.mint);
  const price = at >= 0 ? states[at]! : { ready: null, lastAt: null };
  // Automatic saving settles only against a price the program can verify. When there is none,
  // the page says so in the chain's own numbers instead of promising "as it lands".
  const waited = price.ready === false ? waitedFor(price.lastAt) : null;
  const all = catalogue();
  const initialQuote: QuoteBody | null = quote.ok ? { quote: quote.value.quote, cost: quote.value.cost, solUsd: quote.value.solUsd } : null;
  const disclosures = Object.fromEntries(all.map((s) => [s.mint, disclosure(s)]));

  return (
    <div className="sp-home">
      <HomeNav />

      <header className="sp-home-hero">
        <div className="sp-home-hero-copy">
          <h1 className="sp-home-display">Your income invests itself.</h1>
          <p className="sp-home-lede">Turn part of the USDC in your wallet into stocks you own, then save a slice of every payment by itself.</p>
          <ul className="sp-home-points">
            <li>Into the S&amp;P 500, Nvidia, Apple and {all.length - 3} more, in your own wallet.</li>
            <li>One signature, and a receipt in seconds.</li>
            <li>Weekends too: a save is a swap, not an order that waits for a market.</li>
          </ul>
        </div>
        <section className="sp-home-card" aria-label="Save now">
          <SaveNow
            stocks={all.map(toPicker)}
            featured={featured().map((s) => s.mint)}
            defaultMint={stock.mint}
            initialQuote={initialQuote}
            readAt={CATALOGUE_READ_AT}
            cluster={cluster()}
            disclosures={disclosures}
          />
        </section>
      </header>

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
          Say yes once, and 10% of every USDC payment into your wallet becomes stock in the same wallet. Scrip can move at most the limit
          you set, $200 to start, and you can stop any time. Automatic saving works with the eleven stocks the chain can price, the S&amp;P
          500 first.
        </p>
        {price.ready === false ? (
          <p className="sp-home-wait">
            {settlingNow.length > 0 ? (
              <>
                <strong>Right now automatic saves settle into {listOf(settlingNow)}.</strong> The S&amp;P 500 is waiting: Scrip settles an
                automatic save only against a price it can verify on Solana, and the newest S&amp;P 500 price there is {waited ?? "days"} old.
                Payments meant for it stay in your wallet as USDC until a price returns. Saving now, above, works at any time.
              </>
            ) : (
              <>
                <strong>Right now automatic saves are waiting.</strong> Scrip settles one only against a price it can verify on Solana, and
                the newest S&amp;P 500 price there is {waited ?? "days"} old. Until a price returns, payments you receive stay in your wallet
                as USDC: nothing is lost and nothing is guessed. Saving now, above, works at any time.
              </>
            )}
          </p>
        ) : null}
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
        <p className="sp-home-body">
          <Link href="/app/rule" className="sp-home-link">
            Save 10% of every payment
          </Link>
        </p>
      </section>

      <section className="sp-home-sec" aria-labelledby="teams">
        <h2 id="teams" className="sp-home-h2">
          Whoever pays you can add to it.
        </h2>
        <p className="sp-home-body">
          A team that pays people in USDC can pay part of it in stock, or add stock to what they save, straight to their wallets, with a
          receipt that says why. <Link href="/teams" className="sp-home-link">Scrip for teams</Link>
        </p>
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
        <Link href="/proof">Proof</Link>
        <Link href="/teams">For teams</Link>
        <Link href="/security">Security</Link>
        <Link href="/assets">Assets</Link>
        <Link href="/docs">Docs</Link>
      </footer>
    </div>
  );
}

/** "a, b and c". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

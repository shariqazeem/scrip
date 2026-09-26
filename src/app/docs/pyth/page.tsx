import type { Metadata } from "next";
import { DocFrame } from "@/components/docs/doc-frame";
import { stampUTC } from "@/lib/format";
import { describeAge } from "@/lib/pyth/price";
import { pythFigures } from "@/lib/pyth/figures";

export const metadata: Metadata = { title: "How Scrip uses Pyth", description: "No verified Pyth price, no conversion: the program reads Pyth's account in the same transaction as the swap." };
// "Right now" must mean now: a cached page served the first visitor after a quiet night the
// midnight reading, "4 minutes old, a sweep would settle", on a Saturday morning.
export const dynamic = "force-dynamic";

const pct = (bps: number | null, dp = 3) => (bps === null ? "—" : `${(bps / 100).toFixed(dp)}%`);

export default async function Page() {
  const f = await pythFigures();
  return (
    <DocFrame
      here="/docs/pyth"
      eyebrow="Docs"
      title="How Scrip uses Pyth."
      lede="No verified Pyth price, no conversion. The program reads Pyth's price account in the same transaction as the swap, and refuses anything it cannot verify — so the worst fill any keeper can deliver is set by a price nobody at Scrip controls."
    >
      <h2>The rule, in the program</h2>
      <p>
        <span className="mono">finish_sweep</span> reads a Pyth <span className="mono">PriceUpdateV2</span> account and reverts the whole sweep — the
        delegate transfer and the swap with it — unless all four hold:
      </p>
      <ul>
        <li>the feed is one of the two this register carries;</li>
        <li>the update is <strong>fully verified</strong> — a full quorum of Wormhole guardian signatures checked by Pyth&rsquo;s receiver, not a partial check;</li>
        <li>it was published <strong>under 600 seconds</strong> before the sweep;</li>
        <li>its confidence band is <strong>under 1%</strong> of the price.</li>
      </ul>
      <p>
        Then it computes the minimum the owner must receive from that price — the slice, less the owner&rsquo;s tolerance, divided by the price{" "}
        <em>plus</em> its band — and checks the owner&rsquo;s own token account gained at least that. The code is{" "}
        <span className="mono">anchor/programs/scrip/src/lib.rs</span> (<span className="mono">finish_sweep</span>),{" "}
        <span className="mono">pyth.rs</span> (the account, parsed by offset) and <span className="mono">rule.rs</span> (<span className="mono">min_out_raw</span>).
      </p>

      <h2>Two feeds on every register</h2>
      <p>
        A tokenized stock has two honest prices. <span className="mono">Crypto.SPYX/USD</span> prices the token itself, wherever it trades.{" "}
        <span className="mono">Equity.US.SPY/USD</span> prices one share of the underlying, published on weekdays — before the opening bell too. A
        register carries both feed ids and the program accepts either. When it settles against the share price, it converts through the
        mint&rsquo;s <strong>live</strong> scaled-UI multiplier, because the token&rsquo;s raw units are not shares once dividends have been reinvested.
      </p>

      <h2>What it has done, on mainnet</h2>
      <table>
        <tbody>
          <tr>
            <td>Receipts that settled against a Pyth price</td>
            <td className="mono">{f.stamped}</td>
          </tr>
          {f.byFeed.map((b) => (
            <tr key={b.label}>
              <td>· against {b.label.replace(/^Pyth /, "")}</td>
              <td className="mono">{b.receipts}</td>
            </tr>
          ))}
          <tr>
            <td>Median age of the price at settlement</td>
            <td className="mono">{f.medianAgeSeconds === null ? "—" : `${Math.round(f.medianAgeSeconds)} s`}</td>
          </tr>
          <tr>
            <td>Median confidence band</td>
            <td className="mono">{pct(f.medianBandBps)}</td>
          </tr>
          <tr>
            <td>Median distance between the fill and Pyth&rsquo;s price{f.fills ? `, over ${f.fills} sweep${f.fills === 1 ? "" : "s"}` : ""}</td>
            <td className="mono">{pct(f.medianFillBps, 2)}</td>
          </tr>
        </tbody>
      </table>
      <p>Every figure is read from receipts, each of which anyone can open; each receipt shows its own price, band, age and fill.</p>

      <h2>Right now</h2>
      <p>Read from the price accounts on Solana mainnet at {stampUTC(f.at)}.</p>
      <table>
        <tbody>
          {f.now.map((n) => (
            <tr key={n.label}>
              <td>{n.label.replace(/^Pyth /, "")}</td>
              <td className="mono">
                {n.ageSeconds === null ? "unreadable" : `${describeAge(n.ageSeconds)} old · band ${pct(n.bandBps)} · ${n.settles ? "a sweep would settle" : "a sweep would wait"}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>When there is no price</h2>
      <p>
        At a weekend no fresh price for the S&amp;P 500 can be verified, and the program will not guess one. An arrival waits in the
        owner&rsquo;s wallet — still theirs, still spendable — and the register says it is waiting. When a price returns, the rule settles it.
        Nobody at Scrip can supply a price instead: an operator-supplied price is exactly what this design exists to rule out.
      </p>
    </DocFrame>
  );
}

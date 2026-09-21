import type { Metadata } from "next";
import { DocFrame } from "@/components/docs/doc-frame";

export const metadata: Metadata = { title: "Corporate actions" };

export default function Page() {
  return (
    <DocFrame
      here="/docs/corporate-actions"
      eyebrow="Docs"
      title="Corporate actions, and why a dividend is not a gain."
      lede="xStocks handle dividends and splits with an on-chain multiplier that rebases balances. Store raw balances and compute returns from them, and every number is wrong from the first ex-date."
    >
      <h2>The multiplier is not the field called multiplier</h2>
      <p>
        A Token-2022 ScaledUiAmount config carries two values and a timestamp: <span className="mono">multiplier</span> (the older),{" "}
        <span className="mono">new_multiplier</span> (the newer) and when the newer takes over. Read on mainnet on 2026-09-12, the SPYx mint held
        1.003909240011759 and 1.005714560286254, effective three months in the past. An app that reads the obvious field paints every SPYx
        balance 0.18% short, forever, with nothing about the number looking wrong.
      </p>
      <p>
        <strong>The timestamp on the mint decides.</strong> Read across fourteen mints on 2026-09-15, activations fell at 23:55, 00:30 and 04:00
        UTC, so nothing in Scrip assumes an hour. The program reads the extension by hand in <span className="mono">finish_sweep</span> and applies
        the live value when the price feed is quoted per share.
      </p>

      <h2>Two feeds, and which one carries the multiplier</h2>
      <table>
        <thead>
          <tr>
            <th>Feed</th>
            <th>Prices</th>
            <th>Published</th>
            <th>Multiplier</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">Crypto.SPYX/USD</td>
            <td>one raw token, as it trades</td>
            <td>around the clock</td>
            <td>already inside the price</td>
          </tr>
          <tr>
            <td className="mono">Equity.US.SPY/USD</td>
            <td>one share</td>
            <td>market hours</td>
            <td>applied by the program</td>
          </tr>
        </tbody>
      </table>
      <p>
        On 2026-09-12 SPYX/USD divided by SPY/USD came to 1.00567 against a live multiplier of 1.00571, the difference being feed latency.
        That agreement is the strongest single check that the multiplier handling is right.
      </p>

      <h2>What Scrip stores</h2>
      <p>
        Receipts and measurements carry <strong>raw units</strong>. Keep-rate is computed from raw units. Screens show raw units through the live
        multiplier as share-equivalents, and say when the adjustment could not be read rather than assuming a multiplier of one, because
        assuming one is assuming no corporate action ever happened. Every multiplier ever seen is kept, keyed on when it activated, so a
        rebase is auditable after the fact.
      </p>

      <h2>The two failures this makes impossible</h2>
      <ul>
        <li>A reinvested dividend is not a gain: raw units are unchanged; the multiplier moved.</li>
        <li>A four-for-one split is not a 300% return: raw units are unchanged; the multiplier moved.</li>
      </ul>
    </DocFrame>
  );
}

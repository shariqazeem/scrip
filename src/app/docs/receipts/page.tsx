import type { Metadata } from "next";
import { DocFrame } from "@/components/docs/doc-frame";

export const metadata: Metadata = { title: "Receipts" };

export default function Page() {
  return (
    <DocFrame
      here="/docs/receipts"
      eyebrow="Docs"
      title="Receipts."
      lede="A permanent on-chain account, about 350 bytes, written in the same transaction as the conversion. Anyone can open it, forever."
    >
      <h2>What one carries</h2>
      <table>
        <tbody>
          <tr>
            <th>kind</th>
            <td>Sweep, Settle or Sponsor</td>
          </tr>
          <tr>
            <th>recipient · payer</th>
            <td>The recipient&rsquo;s address; the payer for an intake. A sweep has no payer: senders are attributed off chain from the account&rsquo;s transfer history, and labelled as such.</td>
          </tr>
          <tr>
            <th>basis · rate · paid</th>
            <td>The net inflow that triggered a sweep, the rate applied, the slice converted. For an intake: what was paid, 100%, what was paid.</td>
          </tr>
          <tr>
            <th>asset · amount_raw</th>
            <td>The mint and the raw units received. Raw, so a rebase never reads as a sale.</td>
          </tr>
          <tr>
            <th>price</th>
            <td>The Pyth feed, price, exponent, confidence and publish time the sweep was verified against. Optional for an intake.</td>
          </tr>
          <tr>
            <th>reason_hash</th>
            <td>sha256 of the reason, which travels as an SPL Memo in the same transaction. The page shows the memo only if it hashes to this.</td>
          </tr>
          <tr>
            <th>measured_7d · measured_30d</th>
            <td>The recipient&rsquo;s total raw balance of the asset at 7 and 30 days, written by <span className="mono">measure_receipt</span>, which anyone may call.</td>
          </tr>
        </tbody>
      </table>

      <h2>Where it lives</h2>
      <p>
        <span className="mono">[&quot;receipt&quot;, book, release_id]</span> for a sweep; <span className="mono">[&quot;receipt&quot;, payout, release_id]</span> for an
        intake. Derivable by anyone who knows both, which is the point: a receipt nobody but us can find is not a public record.
      </p>

      <h2>The page</h2>
      <p>
        <span className="mono">/receipt/&lt;signature&gt;</span> is built from one signature and nothing else: the transaction names the accounts it
        touched, the one owned by the program with the Receipt discriminator is the receipt, and the memo in the same transaction is the
        reason. No session, no database. It renders identically from a cold RPC with our servers off.
      </p>

      <h2>Who pays for it</h2>
      <p>
        Rent is about 0.003 SOL, permanent. On a sweep the keeper advances it and is repaid from the owner&rsquo;s float; on an intake the payer
        pays it, shown on the pay page as &ldquo;network and permanent receipt&rdquo;. Owners pay for their own permanent records, transparently.
      </p>
    </DocFrame>
  );
}

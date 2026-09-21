import type { Metadata } from "next";
import { DocFrame } from "@/components/docs/doc-frame";

export const metadata: Metadata = { title: "Keep-rate" };

export default function Page() {
  return (
    <DocFrame
      here="/docs/keep-rate"
      eyebrow="Docs"
      title="Keep-rate."
      lede="The share of what was converted that is still held, measured on chain at 7 and 30 days. It is the difference between a rule and a farm, and it cannot be faked."
    >
      <h2>The method</h2>
      <p>
        Recorded at settlement, measured at 7 and 30 days by anyone who calls <span className="mono">measure_receipt</span>, computed from raw
        units so a rebase never looks like a sale. Per recipient and asset, over the receipts whose window has been measured:
      </p>
      <pre>{`held      = min( balance_raw_at_measure , Σ amount_raw over those receipts )
keep-rate = Σ held × price_at_settle  /  Σ amount_raw × price_at_settle

price_at_settle = paid_usdc ÷ amount_raw, on the receipt`}</pre>
      <p>
        A person&rsquo;s balance is one number that has to cover every receipt they have in that asset, so the cap applies to the group, never
        per receipt: two receipts of 0.065 each against a balance of 0.065 read as 50%, not 100%.
      </p>

      <h2>Why it cannot be faked</h2>
      <ul>
        <li>The denominator is the receipt&rsquo;s own <span className="mono">amount_raw</span>, written by the program when the tokens landed.</li>
        <li>The numerator is a balance the program read from the recipient&rsquo;s own token account, on a date anyone can check.</li>
        <li>Neither is ours to choose, and both are reproducible by a stranger with an RPC endpoint.</li>
      </ul>

      <h2>What it refuses to say</h2>
      <p>
        A window that has not matured is not a zero; the page states the date. A receipt that matured but was never measured is excluded
        and reported, never counted as spent: &ldquo;they sold it&rdquo; and &ldquo;nobody looked&rdquo; are opposite claims. The 7-day figure exists from
        the first measurement; the 30-day figure appears when the first receipt is that old.
      </p>
    </DocFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { SaveNow } from "@/components/save/save-now";
import { saveCardProps } from "@/lib/save/card";
import "@/components/app/savings-home.css";
import "@/components/save/save.css";

export const metadata: Metadata = { title: "Save now" };
export const dynamic = "force-dynamic";

/**
 * SAVE NOW, INSIDE THE APP — the same card as the front door, so a person who is already in
 * their savings never has to leave for the public page to save more. It needs no sign-in: the
 * save is one transaction the wallet signs, and the receipt is read from it.
 */
export default async function SavePage() {
  const card = await saveCardProps();
  return (
    <PageFrame eyebrow="Save now" title="Turn some USDC into a stock you own." sub="From your wallet to your wallet, in one signature, with a receipt in seconds. Scrip never holds your money.">
      <div className="sp-app-save">
        <section className="sp-app-save-card" aria-label="Save now">
          <SaveNow {...card} />
        </section>
        <aside className="sp-app-save-side" aria-label="Before you save">
          <p className="k">Before you sign</p>
          <ul>
            <li>You see the price, the least you will get and the network fee in cents. If the price moves past that, nothing happens.</li>
            <li>The stock lands in this same wallet. Most issuers can freeze or move their tokens; each save says what its issuer can do.</li>
            <li>Stocks go down as well as up. Save what you can leave alone. Not offered to US persons.</li>
          </ul>
          <p className="more">
            Then make it automatic: <Link href="/app/rule">save 10% of every payment</Link>.
          </p>
        </aside>
      </div>
    </PageFrame>
  );
}

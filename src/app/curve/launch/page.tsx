import type { Metadata } from "next";
import { LaunchForm, type LaunchStock } from "@/components/curve/launch-form";
import { PageFrame } from "@/components/app/page-frame";
import { DEPLOYED } from "@/lib/curve/deployed";
import { CURVE_STOCKS, curveQuote } from "@/lib/curve/preset";
import { nameOf } from "@/lib/save/names";
import { cluster } from "@/lib/solana/cluster";
import "@/app/landing.css";
import "../curve.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Launch a token",
  description: "Launch a token priced in the Nasdaq 100, the S&P 500, Tesla or Nvidia. Its trading fees go to savers as stock, and half of them to you if you choose.",
};

/**
 * /CURVE/LAUNCH — a token on Scrip Curve from the launcher's own wallet: a stock, a name, a
 * symbol, an optional first buy, one approval. A stock is offered once its config exists on chain
 * (`deployed.json`); until then it says so instead of failing in the wallet.
 */
export default function LaunchPage() {
  const stocks: LaunchStock[] = CURVE_STOCKS.map((s) => ({
    symbol: s,
    name: nameOf(s),
    issuer: `${curveQuote(s).symbol}, issued by Backed (xStocks)`,
    ready: Boolean(DEPLOYED.configs[s]?.public),
    toSavers: Boolean(DEPLOYED.configs[s]?.demonstration),
  }));
  return (
    <PageFrame
      eyebrow="Launchpad"
      title="Launch a token priced in a stock."
      sub="Pick the stock, name it, sign once. Its trading fees go to savers as stock, through a Scrip Plan, and half of them to you if you choose."
    >
      <div className="sp-cv-body">
        <LaunchForm stocks={stocks} cluster={cluster()} />
      </div>
    </PageFrame>
  );
}

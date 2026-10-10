import type { Metadata } from "next";
import { LaunchForm, type LaunchStock } from "@/components/curve/launch-form";
import { SiteFrame } from "@/components/site/site-frame";
import { DEPLOYED } from "@/lib/curve/deployed";
import { CURVE_STOCKS, curveQuote } from "@/lib/curve/preset";
import { nameOf } from "@/lib/save/names";
import { cluster } from "@/lib/solana/cluster";
import "../curve.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Launch on Scrip Curve",
  description: "Launch a token priced in the Nasdaq 100, the S&P 500, Tesla or Nvidia. Half of every trading fee is yours; the other half goes to savers.",
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
    <SiteFrame
      eyebrow="Scrip Curve"
      title="Launch a token priced in a stock."
      lede="Pick the stock, name it, sign once. Half of every trading fee is yours; the other half goes to savers, as stock, through a Scrip Plan."
    >
      <LaunchForm stocks={stocks} cluster={cluster()} />
    </SiteFrame>
  );
}

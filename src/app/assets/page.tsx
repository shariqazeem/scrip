import type { Metadata } from "next";
import { Info, Pause, ShieldAlert, Snowflake } from "lucide-react";
import { PageFrame } from "@/components/app/page-frame";
import { ASSETS, type Asset, DEFAULT_ASSET_SYMBOL } from "@/lib/assets/registry";
import { usd } from "@/lib/format";
import { explorerUrl } from "@/lib/solana/cluster";

export const metadata: Metadata = {
  title: "Assets",
  description: "What a rule can buy, with the issuer, the wrapper, and what the issuer can do named on every row. Read from the mint accounts themselves.",
};

const UNIT: Record<Asset["unit"], string> = { share: "share-equivalents", "troy-ounce": "troy ounces", dollar: "dollars" };
const KIND: Record<Asset["kind"], string> = { index: "index tracker", equity: "single-name tracker", metal: "allocated metal", cash: "pay-in" };

/**
 * THE REGISTRY, ON A PAGE — where the product's honesty is either real or theatre.
 *
 * Every row names the issuer, the wrapper, and what the token is a claim on. The facts on
 * each row were read off the mint account itself (2026-09-12 and 2026-09-15), which is why
 * the disclosures differ per row instead of being one banner: Oro GOLD has no freeze
 * authority and no permanent delegate; every xStock has both. No price renders here.
 */
export default function AssetsPage() {
  const rule = ASSETS.filter((a) => a.ruleEligible);
  const payIn = ASSETS.filter((a) => !a.ruleEligible);
  return (
    <PageFrame
      eyebrow="Assets"
      title="What a rule can buy, and whose token it is."
      sub="Read from the mint accounts, not from a docs page. Where an issuer can move, burn or freeze a token, the row says so. One asset per book; the default is the S&P 500."
    >
      <div className="sp-stack">
        <p className="sp-note">
          <Info size={16} strokeWidth={2} aria-hidden />
          <span>
            <strong>Every xStock is a tracker certificate, not a share.</strong> Issued by Backed, 1:1 collateralised, no voting rights, not
            offered to US persons. Dividends are reinvested through a mint-level multiplier, never paid, so Scrip never shows an expected
            income. Read across fourteen mints on 2026-09-15: every one carries a permanent delegate, a pause authority, and the
            multiplier; activations were observed at 23:55, 00:30 and 04:00 UTC, so nothing here assumes an hour.
          </span>
        </p>

        <div className="sp-panel">
          <div className="sp-panel-head">
            <span className="sp-panel-title">Rule assets</span>
            <span className="sp-panel-meta">default {DEFAULT_ASSET_SYMBOL} · single names are a choice, never a default</span>
          </div>
          <div className="sp-rows">
            {rule.map((a) => (
              <Row key={a.mint} a={a} />
            ))}
          </div>
        </div>

        <div className="sp-panel">
          <div className="sp-panel-head">
            <span className="sp-panel-title">The pay-in asset</span>
            <span className="sp-panel-meta">the rule watches this account</span>
          </div>
          <div className="sp-rows">
            {payIn.map((a) => (
              <Row key={a.mint} a={a} />
            ))}
          </div>
        </div>

        <div className="sp-panel">
          <div className="sp-panel-head">
            <span className="sp-panel-title">How a quantity is counted</span>
          </div>
          <div className="sp-panel-body">
            <p className="sp-prose">
              A token account holds <strong>raw units</strong>. A tracker that rebases carries a mint-level multiplier, and the quantity a
              screen shows is raw units through that multiplier: share-equivalents. Receipts and keep-rate are computed from raw units,
              so a reinvested dividend never reads as a gain and a four-for-one split never reads as a 300% return. The multiplier in
              force is the one whose timestamp has passed, which on the SPYx mint is not the field named <span className="mono">multiplier</span>.
            </p>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function Row({ a }: { a: Asset }) {
  return (
    <article className="sp-asset">
      <div className="sp-asset-id">
        <span className="sp-asset-sym">{a.symbol}</span>
        <span className="sp-asset-name">{a.name}</span>
        <a className="mono sp-asset-issuer" href={explorerUrl("address", a.mint, "mainnet-beta")} target="_blank" rel="noreferrer">
          {a.mint.slice(0, 8)}…{a.mint.slice(-6)}
        </a>
      </div>
      <p className="sp-asset-issuer">
        <a href={a.issuer.url} target="_blank" rel="noreferrer">
          {a.issuer.name}
        </a>
        <br />
        {a.issuer.wrapper}
        {a.depth ? (
          <>
            <br />
            Jupiter on {a.depth.readAt}: liquidity {usd(a.depth.liquidityUsd)}, 24-hour volume {usd(a.depth.volume24hUsd)}, {a.depth.holders.toLocaleString("en-US")} holders.
          </>
        ) : null}
      </p>
      <div className="sp-asset-meta">
        {a.symbol === DEFAULT_ASSET_SYMBOL ? <span className="sp-chip is-accent">default</span> : null}
        <span className={`sp-chip${a.kind === "metal" ? " is-gold" : ""}`}>{KIND[a.kind]}</span>
        <span className="sp-chip">{UNIT[a.unit]}</span>
        <span className="sp-chip">{a.decimals} decimals</span>
        <span className="sp-chip">{a.program}</span>
        {a.powers.hasMultiplier ? <span className="sp-chip">rebases</span> : null}
        {a.feedRaw ? <span className="sp-chip">{a.feedRaw.label.replace("Pyth ", "Pyth ")}</span> : null}
        {a.powers.permanentDelegate ? (
          <span className="sp-chip is-caution">
            <ShieldAlert size={11} strokeWidth={2.2} aria-hidden />
            permanent delegate
          </span>
        ) : null}
        {a.powers.pausable ? (
          <span className="sp-chip is-caution">
            <Pause size={11} strokeWidth={2.2} aria-hidden />
            pausable
          </span>
        ) : null}
        {a.powers.freezeAuthority ? (
          <span className="sp-chip is-caution">
            <Snowflake size={11} strokeWidth={2.2} aria-hidden />
            freezable
          </span>
        ) : null}
        {a.singleName ? <span className="sp-chip">after-hours liquidity can be thin</span> : null}
      </div>
      <p className="sp-asset-disclosure">{a.disclosure}</p>
    </article>
  );
}

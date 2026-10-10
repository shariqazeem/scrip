import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TradePanel } from "@/components/curve/trade-panel";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { DEPLOYED } from "@/lib/curve/deployed";
import { launchAt } from "@/lib/curve/launches";
import { PRESET, curveQuote, feeBpsAt } from "@/lib/curve/preset";
import { dateUTC, short } from "@/lib/format";
import { nameOf } from "@/lib/save/names";
import { cluster, explorerUrl } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import "../curve.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ pool: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { pool } = await params;
  const found = await launchAt(connection(), pool);
  const l = found.ok ? found.value : null;
  if (!l) return { title: "Scrip Curve" };
  return { title: `${l.symbol ?? "A launch"} on Scrip Curve`, description: `${l.name ?? "A token"}, priced in ${nameOf(l.stock)}. Every trading fee it pays goes half to its launcher and half to savers.` };
}

const units = (raw: bigint, decimals: number, dp = 4) => (Number(raw) / 10 ** decimals).toFixed(dp);

/**
 * /CURVE/[POOL] — one launch, read from the chain: what it is priced in, how far its curve is to
 * graduation, the fee at this moment, what is waiting for savers, and the way to buy or sell it
 * from this page. Anyone's launch on a Scrip Curve config has one; anything else is not found.
 */
export default async function LaunchPage({ params }: Params) {
  const { pool } = await params;
  const found = await launchAt(connection(), pool);
  if (!found.ok) throw new Error(found.why);
  const l = found.value;
  if (!l) notFound();
  const q = curveQuote(l.stock);
  const stockName = nameOf(l.stock);
  const symbol = l.symbol || short(l.baseMint);
  const pct = l.migrated ? 100 : Math.min(100, Math.floor(Number((l.quoteReserveRaw * 1000n) / (l.thresholdRaw || 1n)) / 10));
  const now = Math.floor(Date.now() / 1000);
  const fee = l.migrated ? null : feeBpsAt(now - l.activationUnix);
  const falls = l.activationUnix + PRESET.feeDecaySeconds;
  const plan = DEPLOYED.plans[l.stock];
  const icon = `/api/curve/icon?${new URLSearchParams({ s: l.symbol ?? "?", k: l.stock })}`;
  return (
    <SiteFrame
      eyebrow="Scrip Curve"
      title={`${symbol}, priced in ${stockName}.`}
      lede={`${l.name ?? "A token"}, launched on Scrip Curve by ${short(l.creator)}. Every trading fee it pays is ${stockName}: half to its launcher, half to savers.`}
    >
      <div className="sp-cv-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={72} height={72} />
        <span className="t">
          <span className="sym">{symbol}</span>
          <span className="meta">
            {l.kind === "demonstration" ? "A demonstration launch, every fee to savers. " : ""}Launched {dateUTC(l.activationUnix)}
          </span>
        </span>
      </div>

      <div className="sp-cv-progress">
        <div className={`sp-cv-bar${l.migrated ? " is-done" : ""}`} aria-hidden>
          <span className="fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="nums">
          <span>{l.migrated ? "Graduated to Meteora DAMM v2" : `${units(l.quoteReserveRaw, q.decimals)} of ${units(l.thresholdRaw, q.decimals)} ${stockName} to graduation`}</span>
          <span>{pct}%</span>
        </div>
      </div>

      <TradePanel pool={l.pool} symbol={symbol} stock={l.stock} stockName={stockName} cluster={cluster()} />

      <SiteSection label="This launch, from the chain">
        <div className="sp-truths">
          <Row k="Trading fee now">
            {fee === null ? (
              <>The graduated pool&rsquo;s fee, about {PRESET.migratedPoolFeeBps / 100}%, collected in {stockName}.</>
            ) : (
              <>
                <span className="mono">{(fee / 100).toFixed(2)}%</span>
                {now < falls ? `, falling to ${PRESET.endingFeeBps / 100}% by ${dateUTC(falls)}` : ""}. Collected in {stockName}.
              </>
            )}
          </Row>
          <Row k="For savers">
            <span className="mono">{units(l.partnerFeeRaw, q.decimals, 6)}</span> {stockName} of fee waiting on the curve; Scrip&rsquo;s saving service moves it into the{" "}
            {plan ? (
              <a href={explorerUrl("address", plan.address)}>{stockName} Plan</a>
            ) : (
              `${stockName} Plan`
            )}{" "}
            every half hour, where it matches savers&rsquo; automatic saves.
          </Row>
          <Row k="The curve">
            <a href={explorerUrl("address", l.pool)}>{short(l.pool)}</a>, on Meteora DBC
          </Row>
          <Row k="The token">
            <a href={explorerUrl("address", l.baseMint)}>{short(l.baseMint)}</a>, immutable, no mint authority
          </Row>
          {l.dammPool ? (
            <Row k="Graduated pool">
              <a href={explorerUrl("address", l.dammPool)}>{short(l.dammPool)}</a>, Meteora DAMM v2, every position locked
            </Row>
          ) : null}
          <Row k="Launched by">
            <a href={explorerUrl("address", l.creator)}>{short(l.creator)}</a>
            {l.kind === "public" ? `, who keeps ${PRESET.creatorTradingFeePercentage.public}% of the fee after Meteora's share` : ", who keeps none of the fee"}
          </Row>
        </div>
      </SiteSection>

      <SiteSection label="Before you trade">
        <p className="sp-body">
          <strong>{symbol} is a speculative token, not {stockName} and not a share of it.</strong> It belongs to whoever launched it; Scrip makes no claim about its price,
          only about where its fees go. {q.symbol} is issued by Backed (xStocks): the issuer can freeze or move it. Not offered to US persons.
        </p>
        <p className="sp-body">
          <Link href="/curve">All launches</Link>
        </p>
      </SiteSection>
    </SiteFrame>
  );
}

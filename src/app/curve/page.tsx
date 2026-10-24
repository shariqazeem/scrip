import type { Metadata } from "next";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { PageFrame } from "@/components/app/page-frame";
import { CurveSpark } from "@/components/curve/curve-spark";
import { Row, SiteSection } from "@/components/site/site-frame";
import { StockLogo } from "@/components/stock/stock-logo";
import { configsOf } from "@/lib/curve/deployed";
import { CURVE_STOCKS, DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, METEORA_PROTOCOL_FEE_PERCENT, PRESET, THRESHOLD, curveQuote, tokenBadge } from "@/lib/curve/preset";
import { readCurve } from "@/lib/curve/read";
import { curveShape } from "@/lib/curve/shape";
import { dateUTC, short, usdc } from "@/lib/format";
import { prices as jupPrices } from "@/lib/jupiter/client";
import { plansSummary } from "@/lib/plan/read";
import { nameOf } from "@/lib/save/names";
import { explorerUrl } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import { FeeCalculator } from "./calculator";
import { MoneyTrail } from "./trail";
import "./curve.css";
import "./curve-home.css";

// Nothing here depends on who is asking, and the chain reads behind it (every launch, its curve, the
// Plans, Jupiter's prices) took 9.6 s cold on 24 Oct: built once and refreshed every minute in the
// background, a visitor gets it from the cache. Uncached fetches inside would otherwise make it
// render per request; force-static keeps the minute's cache for this page alone, as on the front door.
export const dynamic = "force-static";
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Launchpad",
  description:
    "Every trade pays savers. Launch a token priced in the Nasdaq 100, the S&P 500, Tesla or Nvidia on Meteora's Dynamic Bonding Curve: every trading fee is stock, and the savers' share goes straight into a Scrip Plan that matches real people's automatic savings.",
};

const REPO = "https://github.com/shariqazeem/scrip/blob/main";
const STOCK_LIST = "the Nasdaq 100, the S&P 500, Tesla or Nvidia";
/** The most launches drawn as cards with their curves; the rest are a line each. */
const BOARD = 6;

/** Base units of a stock, as a person reads them: "0.0100". */
function units(raw: bigint | null | undefined, decimals = 8): string {
  if (raw === null || raw === undefined) return "—";
  const v = Number(raw) / 10 ** decimals;
  // A launch fee is often a few hundred-thousandths: four places would print it as 0.0001.
  return v > 0 && v < 0.01 ? v.toFixed(6) : v.toFixed(4);
}

/** Dollars at Jupiter's price, for display beside units; nothing when there is no price. */
function dollars(raw: bigint | null | undefined, decimals: number, price: number | null): string | null {
  if (raw === null || raw === undefined || price === null) return null;
  const v = (Number(raw) / 10 ** decimals) * price;
  return v >= 100 ? `$${Math.round(v).toLocaleString("en-US")}` : `$${v.toFixed(2)}`;
}

/**
 * /CURVE — Scrip Curve, the launchpad: every trade on a launch pays savers. A token priced in a
 * stock on Meteora's Dynamic Bonding Curve, launched from this site, and every launch's partner fee
 * goes into a Scrip Plan in the same stock that matches savers' automatic saves.
 *
 * Rebuilt on 24 October as a market, not a document: what a launch pays savers (arithmetic on the
 * preset), where a fee goes with the latest real transaction at each step, Scrip Curve as one of
 * the three ways stock reaches a saver (a judge who arrives here from a submission link sees the
 * whole of Scrip), the four stocks with their Plans, every launch with its curve, and the
 * configuration at a glance. The full preset, every row of it, sits in one drawer below. Every
 * figure is read from the chain or labelled arithmetic; no claim is made about any launch's price.
 */
export default async function CurvePage() {
  const read = readCurve();
  const mints = CURVE_STOCKS.map((s) => curveQuote(s).mint);
  const [plans, launches, summary, priced] = await Promise.all([
    read.plans,
    read.launches,
    plansSummary().catch(() => null),
    jupPrices(mints).catch(() => null),
  ]);
  const priceOf = (mint: string): number | null => (priced && priced.ok ? (priced.value.get(mint) ?? null) : null);
  const shown = launches.slice(0, BOARD);
  const shapes = await Promise.all(shown.map((l) => curveShape(connection(), l).catch(() => null)));
  const configs = configsOf();
  const inflows = plans
    .flatMap((p) => p.inflows.map((f) => ({ ...f, stock: p.stock, decimals: p.decimals })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
  const latestTrade =
    shapes
      .flatMap((s, i) => (s && s.ok ? s.value.marks.map((m) => ({ ...m, launch: shown[i]! })) : []))
      .sort((a, b) => b.at - a.at)[0] ?? null;
  const latestFee = inflows[0] ?? null;
  const matched = plans.filter((p) => p.matches > 0);
  const matches = matched.reduce((n, p) => n + p.matches, 0);
  const matchedUsdc = matched.reduce((n, p) => n + p.matchedUsdc, 0n);
  const fees = plans.reduce((n, p) => n + p.inflows.length, 0);
  const live = summary && summary.ok ? summary.value : null;

  return (
    <PageFrame
      eyebrow="Launchpad"
      title="Every trade pays savers."
      sub={`Scrip Curve launches tokens on Meteora's Dynamic Bonding Curve, priced in a tokenized stock: ${STOCK_LIST}. Every trading fee is that stock, and the savers' share goes straight into a Scrip Plan that adds it to real people's automatic saves.`}
      actions={
        <Link href="/curve/launch" className="sp-action is-primary">
          Launch a token
        </Link>
      }
    >
      <div className="sp-cvh">
        <div className="sp-cvh-top">
          <FeeCalculator
            stocks={CURVE_STOCKS.map((s) => {
              const q = curveQuote(s);
              return { symbol: s, name: nameOf(s), mint: q.mint, perUnitUsd: priceOf(q.mint) };
            })}
            terms={{
              feeBps: PRESET.endingFeeBps,
              firstHourFeeBps: PRESET.startingFeeBps,
              meteoraPercent: METEORA_PROTOCOL_FEE_PERCENT,
              launcherPercent: PRESET.creatorTradingFeePercentage.public,
              migrationFeePercent: PRESET.migrationFeePercentage,
            }}
          />

          <section className="sp-cvh-live" aria-labelledby="sp-cvh-live-h">
            <h2 id="sp-cvh-live-h" className="sp-cvh-h">
              Where a fee goes, on mainnet
            </h2>
            <ol className="sp-cvh-steps">
              <li>
                <span className="n" aria-hidden>
                  1
                </span>
                <span className="t">A trade pays its fee in the stock</span>
                <span className="s">On Meteora&rsquo;s Dynamic Bonding Curve</span>
                {latestTrade ? (
                  <a className="go" href={explorerUrl("tx", latestTrade.sig)}>
                    Latest: a {latestTrade.side} of {latestTrade.launch.symbol || "a launch"}, {dateUTC(latestTrade.at)}
                  </a>
                ) : (
                  <span className="s">The first trade on a launch appears here.</span>
                )}
              </li>
              <li>
                <span className="n" aria-hidden>
                  2
                </span>
                <span className="t">The savers&rsquo; share goes straight into a Plan</span>
                <span className="s mono">claim_trading_fee, receiver = the Plan</span>
                {latestFee ? (
                  <a className="go" href={explorerUrl("tx", latestFee.sig)}>
                    Latest: +{units(latestFee.raw, latestFee.decimals)} {nameOf(latestFee.stock)} from {latestFee.from}, {dateUTC(latestFee.at)}
                  </a>
                ) : (
                  <span className="s">The first fee into a Plan appears here.</span>
                )}
              </li>
              <li>
                <span className="n" aria-hidden>
                  3
                </span>
                <span className="t">The Plan matches savers&rsquo; automatic saves</span>
                <span className="s mono">match_receipt, seconds after each save</span>
                {matches > 0 ? (
                  <a className="go" href={explorerUrl("address", matched[0]!.address)}>
                    {matches} automatic save{matches === 1 ? "" : "s"} matched so far, {usdc(matchedUsdc)} in stock
                  </a>
                ) : (
                  <span className="s">The first match appears on a saver&rsquo;s own receipt.</span>
                )}
              </li>
            </ol>
          </section>
        </div>

        <section className="sp-cvh-sec sp-cvh-whole" aria-labelledby="sp-cvh-whole-h">
          <h2 id="sp-cvh-whole-h" className="sp-cvh-h">
            Scrip Curve is one part of Scrip
          </h2>
          <p className="sp-cvh-lede">
            Scrip turns money people receive into stock in their own wallet, on a receipt anyone can open. Stock reaches a saver three ways, and launches
            are the third.
          </p>
          <ol className="sp-cvh-ways">
            <li>
              <span className="k">From every payment</span>
              <p>A slice of every USDC payment someone receives becomes stock in their own wallet, by itself, checked against a price Pyth verified.</p>
              <p className="f">On mainnet since 21 September 2026.</p>
              <Link href="/">Start saving</Link>
            </li>
            <li>
              <span className="k">From whoever pays them</span>
              <p>A Plan adds a share of every automatic save its people make, in stock, from an escrow the program holds, capped each month.</p>
              {live && live.plans > 0 ? (
                <p className="f">
                  On mainnet now: {live.plans} Plan{live.plans === 1 ? "" : "s"}, {live.matches} match{live.matches === 1 ? "" : "es"} paid.
                </p>
              ) : null}
              <Link href="/teams">Scrip for teams</Link>
            </li>
            <li className="is-here">
              <span className="k">From every trade on a launch</span>
              <p>The savers&rsquo; share of every trading fee on Scrip Curve goes into the Plans, which add it to people&rsquo;s automatic saves.</p>
              <p className="f">
                On mainnet now: {launches.length} launch{launches.length === 1 ? "" : "es"}, {fees} fee{fees === 1 ? "" : "s"} paid into a Plan.
              </p>
              <span className="here">You are here</span>
            </li>
          </ol>
        </section>

        <section className="sp-cvh-sec" aria-labelledby="sp-cvh-stocks-h">
          <h2 id="sp-cvh-stocks-h" className="sp-cvh-h">
            Priced in a tokenized stock
          </h2>
          <p className="sp-cvh-lede">
            Each launch is priced in one of four stocks, and each stock has its own Plan, so a fee reaches savers in that stock without a swap.
          </p>
          <ul className="sp-cvh-rails">
            {CURVE_STOCKS.map((s) => {
              const q = curveQuote(s);
              const plan = plans.find((p) => p.stock === s);
              const mine = launches.filter((l) => l.stock === s);
              const graduated = mine.filter((l) => l.migrated).length;
              const worth = dollars(plan?.escrowRaw, plan?.decimals ?? q.decimals, priceOf(q.mint));
              return (
                <li key={s} className="sp-cvh-rail">
                  <div className="id">
                    <StockLogo mint={q.mint} size={40} />
                    <span className="t">{nameOf(s)}</span>
                    <span className="tk">{q.symbol}, issued by Backed (xStocks)</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Launches</dt>
                      <dd>
                        {mine.length}
                        {graduated > 0 ? `, ${graduated} graduated` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>In its Plan</dt>
                      <dd>
                        {plan ? (
                          <a href={explorerUrl("address", plan.escrow)}>
                            {units(plan.escrowRaw, plan.decimals)}
                            {worth ? ` (${worth})` : ""}
                          </a>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>From launches</dt>
                      <dd>{plan ? units(plan.fromLaunchesRaw, plan.decimals) : "—"}</dd>
                    </div>
                    <div>
                      <dt>Plan members</dt>
                      <dd>{plan ? plan.members : "—"}</dd>
                    </div>
                  </dl>
                  <Link href={`/curve/launch?stock=${s}`} className="sp-action">
                    Launch in {nameOf(s)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="sp-cvh-sec" aria-labelledby="sp-cvh-board-h">
          <div className="sp-cvh-headrow">
            <h2 id="sp-cvh-board-h" className="sp-cvh-h">
              Every launch
            </h2>
            <span className="aside">{launches.length} on chain</span>
          </div>
          {launches.length === 0 ? (
            <p className="sp-body">No launch yet. The first appears here the moment it is on chain, whoever launches it.</p>
          ) : (
            <ul className="sp-cvh-board">
              {shown.map((l, i) => {
                const shape = shapes[i];
                const pct = l.migrated ? 100 : Math.min(100, Math.floor(Number((l.quoteReserveRaw * 1000n) / (l.thresholdRaw || 1n)) / 10));
                const trades = shape && shape.ok ? shape.value.marks.length : null;
                const symbol = l.symbol || short(l.baseMint);
                return (
                  <li key={l.pool}>
                    <Link href={`/curve/${l.pool}`} className="sp-cvh-card">
                      <span className="top">
                        <StockLogo mint={curveQuote(l.stock).mint} size={28} />
                        <span className="sym">{symbol}</span>
                        <span className={`kind${l.kind === "demonstration" ? " is-demo" : ""}`}>{l.kind === "demonstration" ? "A demonstration" : "Public"}</span>
                      </span>
                      <span className="name">{l.name || "Unnamed"}</span>
                      {shape && shape.ok ? <CurveSpark shape={shape.value} label={`${symbol}'s curve, priced in ${nameOf(l.stock)}`} /> : null}
                      <span className="meta">
                        <span>{l.migrated ? "Graduated to Meteora DAMM v2" : l.quoteReserveRaw >= l.thresholdRaw ? "Full, ready to graduate" : `${pct}% to graduation`}</span>
                        <span>
                          Priced in {nameOf(l.stock)}
                          {trades !== null ? `, ${trades} trade${trades === 1 ? "" : "s"}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {launches.length > shown.length ? (
            <ul className="sp-cv-list">
              {launches.slice(BOARD).map((l) => (
                <li key={l.pool}>
                  <Link href={`/curve/${l.pool}`}>
                    {l.symbol || short(l.baseMint)}, priced in {nameOf(l.stock)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="sp-cv-note">Each launch is its launcher&rsquo;s, not Scrip&rsquo;s. Scrip makes no claim about any launch&rsquo;s price, only about where its fees go.</p>
        </section>

        <section className="sp-cvh-sec" aria-labelledby="sp-cvh-config-h">
          <h2 id="sp-cvh-config-h" className="sp-cvh-h">
            The configuration, at a glance
          </h2>
          <ul className="sp-cvh-config">
            <li>
              <span className="k">Priced in</span>
              <span className="v">A tokenized stock</span>
              <span className="s">Nasdaq 100, S&amp;P 500, Tesla or Nvidia, with Meteora&rsquo;s token badges for DBC and DAMM v2.</span>
            </li>
            <li>
              <span className="k">Trading fee</span>
              <span className="v">
                {PRESET.startingFeeBps / 100}% falling to {PRESET.endingFeeBps / 100}% in an hour
              </span>
              <span className="s">An early sniper pays savers; a holder does not.</span>
            </li>
            <li>
              <span className="k">Fee claimer</span>
              <span className="v">A Scrip Plan</span>
              <span className="s">The savers&rsquo; share moves from the curve into the Plan&rsquo;s escrow in one instruction. No wallet holds it in between.</span>
            </li>
            <li>
              <span className="k">Graduation</span>
              <span className="v">About $850 of the stock</span>
              <span className="s">To Meteora DAMM v2, graduated by Meteora&rsquo;s own service. A demonstration graduates at about $15.</span>
            </li>
            <li>
              <span className="k">Liquidity</span>
              <span className="v">Locked for good</span>
              <span className="s">Nobody can pull the pool, and the locked partner position keeps paying the Plan.</span>
            </li>
            <li>
              <span className="k">Supply</span>
              <span className="v">Fixed at launch</span>
              <span className="s">Immutable metadata and no mint authority: nobody can mint more.</span>
            </li>
          </ul>
        </section>

        <SiteSection label="Proof, on mainnet">
          <div className="sp-truths">
            <Row k="Configs">
              {configs.map((c, i) => (
                <span key={c.address}>
                  {i > 0 ? ", " : ""}
                  <a href={explorerUrl("address", c.address)}>
                    {nameOf(c.stock)} {c.kind}
                  </a>
                </span>
              ))}
              .
            </Row>
            <Row k="Plans">
              {plans.map((p, i) => (
                <span key={p.stock}>
                  {i > 0 ? ", " : ""}
                  <a href={explorerUrl("address", p.address)}>{nameOf(p.stock)}</a>
                  {p.sponsorHandle ? ` (@${p.sponsorHandle})` : ""}
                </span>
              ))}
              {plans.length === 0 ? "The Plans are read from the chain the moment they exist." : "."}
            </Row>
            {inflows.map((f) => (
              <Row key={f.sig} k={dateUTC(f.at)}>
                <a href={explorerUrl("tx", f.sig)}>
                  <span className="mono">+{units(f.raw, f.decimals)}</span> {nameOf(f.stock)} into its Plan, from {f.from}
                </a>
              </Row>
            ))}
            <Row k="Rehearsed">
              <span className="mono">npm run curve:rehearse</span> runs every step on a local validator holding Meteora&rsquo;s mainnet DBC and DAMM v2
              programs, the stocks&rsquo; mints and Meteora&rsquo;s badges: the Plans, the configs, launches, buys, fees into the Plans, graduation, and a
              trade on the graduated pool with its fee into the Plan.
            </Row>
            <Row k="The code">
              <a href={`${REPO}/src/lib/curve/preset.ts`}>preset.ts</a>, <a href={`${REPO}/src/lib/curve/build.ts`}>build.ts</a>,{" "}
              <a href={`${REPO}/src/lib/curve/claims.ts`}>claims.ts</a>, <a href={`${REPO}/src/lib/curve/launches.ts`}>launches.ts</a>,{" "}
              <a href={`${REPO}/scripts/curve.ts`}>curve.ts</a>.
            </Row>
          </div>
        </SiteSection>

        <details className="sp-cvh-more">
          <summary>Everything about the preset, step by step</summary>
          <div className="sp-cvh-more-body">
            <MoneyTrail />
            <div className="sp-truths">
              <Row k="1. A trade pays in stock">
                A curve&rsquo;s quote is a tokenized stock, so a buy pays in it and the fee is charged in it. The fee starts at {PRESET.startingFeeBps / 100}% and
                falls to {PRESET.endingFeeBps / 100}% over the first hour: an early bot pays the savers, a holder does not.
              </Row>
              <Row k="2. Straight into a Plan">
                Meteora&rsquo;s own <span className="mono">claim_trading_fee</span>, with a Scrip Plan as the receiver, moves the savers&rsquo; share from the
                curve&rsquo;s vault into that Plan&rsquo;s escrow, its own account in the same stock. One instruction; no wallet holds the fee in between.
                Scrip&rsquo;s saving service signs it every half hour, for every launch on every config.
              </Row>
              <Row k="3. The Plan matches savers">
                Every automatic save a member of the Plan makes is matched from that escrow, in stock, by Scrip&rsquo;s program: a share of the save, capped each
                month, priced against Pyth, never taken back.
              </Row>
              <Row k="4. Graduation keeps paying">
                At about $850 of its stock a curve graduates to a Meteora DAMM v2 pool, launch token and stock, all liquidity locked for good; Meteora&rsquo;s own
                service graduates it. The locked partner position&rsquo;s fees go to the same Plan with <span className="mono">claim_position_fee</span>, and the
                partner&rsquo;s {PRESET.migrationFeePercentage}% graduation fee is moved in the same minute it is withdrawn.
              </Row>
              <Row k="Fee">
                {PRESET.startingFeeBps / 100}% falling to {PRESET.endingFeeBps / 100}% over an hour, collected in the stock. Meteora keeps{" "}
                {METEORA_PROTOCOL_FEE_PERCENT}% of each fee; of the rest, the launcher keeps {PRESET.creatorTradingFeePercentage.public}% and savers get the other
                half. A demonstration gives its launcher none of it.
              </Row>
              <Row k="Graduation">
                To Meteora DAMM v2 at about $850 of the stock:{" "}
                {CURVE_STOCKS.map((s, i) => (
                  <span key={s}>
                    {i > 0 ? ", " : ""}
                    <span className="mono">{THRESHOLD.public[s]}</span> {nameOf(s)}
                  </span>
                ))}
                . Above the $750 Meteora&rsquo;s own service needs to graduate a stock-quoted curve by itself. A {PRESET.migrationFeePercentage}% graduation fee;
                the graduated pool collects its fee in the stock.
              </Row>
              <Row k="A stock-pair">
                Meteora asks for launch mechanics tuned to tokenized stocks. Pricing a launch in one makes every fee a share of that stock, and a Plan&rsquo;s escrow
                holds the same stock, so a fee needs no swap to reach a saver.
              </Row>
              <Row k="Open to anyone today">
                xStocks carry a permanent delegate and a pause authority, which Meteora allows only with a token badge. Both badges, for DBC and DAMM v2, exist on
                mainnet for all four:{" "}
                {CURVE_STOCKS.map((s, i) => (
                  <span key={s}>
                    {i > 0 ? ", " : ""}
                    <a href={explorerUrl("address", tokenBadge(DBC_PROGRAM_ID, new PublicKey(curveQuote(s).mint)).toBase58())}>{curveQuote(s).symbol}</a>
                    {" / "}
                    <a href={explorerUrl("address", tokenBadge(DAMM_V2_PROGRAM_ID, new PublicKey(curveQuote(s).mint)).toBase58())}>pool</a>
                  </span>
                ))}
                .
              </Row>
              <Row k="Not a vault">
                Meteora&rsquo;s Dynamic Fee Sharing vault accepts only plain mints and refuses an xStock, so the claim names the Plan directly instead. Fewer moving
                parts, and the fee never sits anywhere but the Plan.
              </Row>
              <Row k="What rests on trust">
                The claim is signed by Scrip&rsquo;s saving service, which Meteora lets choose the receiver; it only ever names the Plan in the curve&rsquo;s own
                stock, and every claim is public. A Scrip program instruction that claims into the Plan by itself is the next step.
              </Row>
            </div>
          </div>
        </details>

        <SiteSection label="Before you trade a launch">
          <p className="sp-body">
            <strong>A launch is a speculative token, not a stock and not a share of one. Scrip makes no claim about its price; it guarantees only where its fees go.</strong>{" "}
            Each launch belongs to whoever launched it. The stocks are issued by Backed (xStocks): the issuer can freeze or move them, and dividends are
            reinvested. Not offered to US persons.
          </p>
        </SiteSection>
      </div>
    </PageFrame>
  );
}

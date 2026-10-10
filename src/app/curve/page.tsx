import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { configsOf } from "@/lib/curve/deployed";
import { CURVE_STOCKS, DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, PRESET, THRESHOLD, curveQuote, tokenBadge } from "@/lib/curve/preset";
import { readCurve } from "@/lib/curve/read";
import { dateUTC, short, usdc } from "@/lib/format";
import { nameOf } from "@/lib/save/names";
import { explorerUrl } from "@/lib/solana/cluster";
import { PublicKey } from "@solana/web3.js";
import { MoneyTrail } from "./trail";
import "./curve.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scrip Curve",
  description:
    "Launch a token priced in the Nasdaq 100, the S&P 500, Tesla or Nvidia on Meteora's Dynamic Bonding Curve. Every trading fee is stock, and the savers' share goes straight into a Scrip Plan that matches real people's automatic savings.",
};

const REPO = "https://github.com/shariqazeem/scrip/blob/main";
const STOCK_LIST = "the Nasdaq 100, the S&P 500, Tesla or Nvidia";

/** Base units of a stock, as a person reads them: "0.0100". */
function units(raw: bigint | null | undefined, decimals = 8): string {
  if (raw === null || raw === undefined) return "—";
  const v = Number(raw) / 10 ** decimals;
  // A launch fee is often a few hundred-thousandths: four places would print it as 0.0001.
  return v > 0 && v < 0.01 ? v.toFixed(6) : v.toFixed(4);
}

/**
 * /CURVE — Scrip Curve, "Launches" on every nav since 10 October: launch a token priced in a stock on
 * Meteora's Dynamic Bonding Curve, from this site, and every launch's partner fee goes into a
 * Scrip Plan in the same stock that matches savers' automatic saves. The page reads the launches
 * (every pool on a Scrip Curve config, anyone's), the Plans and every fee transfer from the chain,
 * and makes no claim about any launch's price.
 */
export default async function CurvePage() {
  const read = readCurve();
  const [plans, launches] = await Promise.all([read.plans, read.launches]);
  const configs = configsOf();
  const inflows = plans
    .flatMap((p) => p.inflows.map((f) => ({ ...f, stock: p.stock, decimals: p.decimals })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
  return (
    <SiteFrame
      eyebrow="Scrip Curve"
      title="Launch a token priced in a stock. Its fees match savers."
      lede={`A launch preset on Meteora's Dynamic Bonding Curve, priced in ${STOCK_LIST}. Every buy pays in the stock and every trading fee is stock; the savers' share goes straight from the curve into a Scrip Plan, which adds it to real people's automatic savings.`}
    >
      <div className="sp-cv-actions">
        <Link href="/curve/launch" className="sp-btn is-primary">
          Launch a token
        </Link>
      </div>

      <SiteSection label="Launches" aside={launches.length > 0 ? `${launches.length} on chain` : undefined}>
        {launches.length === 0 ? (
          <p className="sp-body">No launch yet. The first appears here the moment it is on chain, whoever launches it.</p>
        ) : (
          <ul className="sp-cv-list">
            {launches.map((l) => {
              const pct = l.migrated ? 100 : Math.min(100, Math.floor(Number((l.quoteReserveRaw * 1000n) / (l.thresholdRaw || 1n)) / 10));
              return (
                <li key={l.pool}>
                  <Link href={`/curve/${l.pool}`} className="sp-cv-launch">
                    <span className="who">
                      <span className="sym">{l.symbol || short(l.baseMint)}</span>
                      <span className="name">
                        {l.name || "Unnamed"}
                        {l.kind === "demonstration" ? ", a demonstration" : ""}
                      </span>
                    </span>
                    <span className="where">
                      {nameOf(l.stock)}
                      <br />
                      {l.migrated ? "graduated" : `${pct}% to graduation`}
                    </span>
                    <span className={`sp-cv-bar${l.migrated ? " is-done" : ""}`} aria-hidden>
                      <span className="fill" style={{ width: `${pct}%` }} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <p className="sp-cv-note">Each launch is its launcher&rsquo;s, not Scrip&rsquo;s. Scrip makes no claim about any launch&rsquo;s price, only about where its fees go.</p>
      </SiteSection>

      <SiteSection label="The money trail">
        <MoneyTrail />
        <div className="sp-truths">
          <Row k="1. A trade pays in stock">
            A curve&rsquo;s quote is a tokenized stock, so a buy pays in it and the fee is charged in it. The fee starts at {PRESET.startingFeeBps / 100}% and falls to{" "}
            {PRESET.endingFeeBps / 100}% over the first hour: an early bot pays the savers, a holder does not.
          </Row>
          <Row k="2. Straight into a Plan">
            Meteora&rsquo;s own <span className="mono">claim_trading_fee</span>, with a Scrip Plan as the receiver, moves the savers&rsquo; share from the curve&rsquo;s
            vault into that Plan&rsquo;s escrow, its own account in the same stock. One instruction; no wallet holds the fee in between. Scrip&rsquo;s saving service
            signs it every half hour, for every launch on every config.
          </Row>
          <Row k="3. The Plan matches savers">
            Every automatic save a member of the Plan makes is matched from that escrow, in stock, by Scrip&rsquo;s program: a share of the save, capped each month,
            priced against Pyth, never taken back.
          </Row>
          <Row k="4. Graduation keeps paying">
            At about $850 of its stock a curve graduates to a Meteora DAMM v2 pool, launch token and stock, all liquidity locked for good; Meteora&rsquo;s own keepers
            graduate it. The locked partner position&rsquo;s fees go to the same Plan with <span className="mono">claim_position_fee</span>, and the partner&rsquo;s{" "}
            {PRESET.migrationFeePercentage}% graduation fee is moved in the same minute it is withdrawn.
          </Row>
          <Row k="5. Every step is a transaction">Each fee below links the transaction that moved it; each match is on the saver&rsquo;s own receipt.</Row>
        </div>
      </SiteSection>

      <SiteSection label="The Plans, from the chain">
        {plans.length === 0 ? (
          <p className="sp-body">The Plans open when Scrip Curve is set up on mainnet; this page reads them from the chain the moment they exist.</p>
        ) : (
          <div className="sp-truths">
            {plans.map((p) => (
              <Row key={p.stock} k={nameOf(p.stock)}>
                The Plan <a href={explorerUrl("address", p.address)}>{short(p.address)}</a>
                {p.sponsorHandle ? `, sponsored by @${p.sponsorHandle}` : ""}. Its escrow <a href={explorerUrl("address", p.escrow)}>{short(p.escrow)}</a> holds{" "}
                <span className="mono">{units(p.escrowRaw, p.decimals)}</span> {nameOf(p.stock)}, <span className="mono">{units(p.fromLaunchesRaw, p.decimals)}</span> of it from
                launches in {p.inflows.length} transfer{p.inflows.length === 1 ? "" : "s"}.{" "}
                {p.matches > 0
                  ? `${p.matches} automatic save${p.matches === 1 ? "" : "s"} matched, ${usdc(p.matchedUsdc)} in all, to ${p.members} member${p.members === 1 ? "" : "s"}.`
                  : `${p.members} member${p.members === 1 ? "" : "s"}; a match lands seconds after a member's automatic save, whenever a price can be verified.`}
              </Row>
            ))}
            {inflows.map((f) => (
              <Row key={f.sig} k={dateUTC(f.at)}>
                <a href={explorerUrl("tx", f.sig)}>
                  <span className="mono">+{units(f.raw, f.decimals)}</span> {nameOf(f.stock)} from {f.from}
                </a>
              </Row>
            ))}
          </div>
        )}
      </SiteSection>

      <SiteSection label="The preset">
        <div className="sp-truths">
          <Row k="Four stocks">
            {CURVE_STOCKS.map((s, i) => (
              <span key={s}>
                {i > 0 ? (i === CURVE_STOCKS.length - 1 ? " and " : ", ") : ""}
                {nameOf(s)} (<span className="mono">{curveQuote(s).symbol}</span>)
              </span>
            ))}
            , each issued by Backed (xStocks): the issuer can freeze or move it, and dividends are reinvested. Not offered to US persons.
          </Row>
          <Row k="Fee">
            {PRESET.startingFeeBps / 100}% falling to {PRESET.endingFeeBps / 100}% over an hour, collected in the stock. Meteora keeps a fifth of each fee; of the rest, the
            launcher keeps {PRESET.creatorTradingFeePercentage.public}% and savers get the other half. A demonstration gives its launcher none of it.
          </Row>
          <Row k="Graduation">
            To Meteora DAMM v2 at about $850 of the stock:{" "}
            {CURVE_STOCKS.map((s, i) => (
              <span key={s}>
                {i > 0 ? ", " : ""}
                <span className="mono">{THRESHOLD.public[s]}</span> {nameOf(s)}
              </span>
            ))}
            . Above the $750 Meteora&rsquo;s keepers need to graduate a stock-quoted curve by themselves. A {PRESET.migrationFeePercentage}% graduation fee; the graduated
            pool collects its fee in the stock.
          </Row>
          <Row k="Liquidity">Every position locked for good at graduation: nobody can pull the pool, and the locked partner position keeps paying the Plan.</Row>
          <Row k="Token">A plain SPL token with immutable metadata and no mint authority: nobody can mint more after launch. Its image is drawn by Scrip from its symbol.</Row>
          {configs.map((c) => (
            <Row key={c.address} k={`${nameOf(c.stock)}, ${c.kind}`}>
              Config <a href={explorerUrl("address", c.address)}>{short(c.address)}</a>
            </Row>
          ))}
        </div>
      </SiteSection>

      <SiteSection label="Why stocks">
        <div className="sp-truths">
          <Row k="A stock-pair">
            Meteora asks for launch mechanics tuned to tokenized stocks. Pricing a launch in one makes every fee a share of that stock, and a Plan&rsquo;s escrow holds the
            same stock, so a fee needs no swap to reach a saver.
          </Row>
          <Row k="Permissionless today">
            xStocks carry a permanent delegate and a pause authority, which Meteora allows only with a token badge. Both badges, for DBC and DAMM v2, exist on mainnet for
            all four:{" "}
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
            Meteora&rsquo;s Dynamic Fee Sharing vault accepts only plain mints and refuses an xStock, so the claim names the Plan directly instead. Fewer moving parts, and
            the fee never sits anywhere but the Plan.
          </Row>
        </div>
      </SiteSection>

      <SiteSection label="Proven before it ran">
        <ul>
          <li>
            <strong>On Meteora&rsquo;s own programs:</strong> <span className="mono">npm run curve:rehearse</span> boots a local validator holding the mainnet DBC and
            DAMM v2 programs, Token-2022, the stocks&rsquo; mints and Meteora&rsquo;s badges, and runs the same steps: the Plans, the configs, launches, buys, the fees into
            the Plans, graduation, a trade on the graduated pool and its fee into the Plan.
          </li>
          <li>
            <strong>Simulated on mainnet:</strong> every config in every stock, the Plans, and a launch&rsquo;s first buy through Jupiter.
          </li>
          <li>
            <strong>The code:</strong> <a href={`${REPO}/src/lib/curve/preset.ts`}>preset.ts</a>, <a href={`${REPO}/src/lib/curve/build.ts`}>build.ts</a>,{" "}
            <a href={`${REPO}/src/lib/curve/claims.ts`}>claims.ts</a>, <a href={`${REPO}/src/lib/curve/launches.ts`}>launches.ts</a>,{" "}
            <a href={`${REPO}/scripts/curve.ts`}>curve.ts</a>.
          </li>
          <li>
            <strong>What rests on trust:</strong> the claim is signed by Scrip&rsquo;s saving service, which Meteora lets choose the receiver; it only ever names the Plan
            in the curve&rsquo;s own stock, and every claim is public. A Scrip program instruction that claims into the Plan by itself is the next step.
          </li>
        </ul>
      </SiteSection>

      <SiteSection label="Before you trade a launch">
        <p className="sp-body">
          <strong>A launch is a speculative token, not a stock and not a share of one. Scrip makes no claim about its price; it guarantees only where its fees go.</strong>{" "}
          Each launch belongs to whoever launched it. Not offered to US persons.
        </p>
        <p className="sp-body">
          <Link href="/teams">Plans, for whoever pays you</Link>
        </p>
      </SiteSection>
    </SiteFrame>
  );
}

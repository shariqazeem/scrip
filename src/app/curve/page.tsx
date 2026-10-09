import type { Metadata } from "next";
import Link from "next/link";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { DEPLOYED } from "@/lib/curve/deployed";
import { CURVE_QUOTE, CURVE_QUOTE_MINT, DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, PRESET, THRESHOLD_QUOTE, tokenBadge } from "@/lib/curve/preset";
import { readCurve } from "@/lib/curve/read";
import { dateUTC, short, usdc } from "@/lib/format";
import { explorerUrl } from "@/lib/solana/cluster";
import { MoneyTrail } from "./trail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scrip Curve",
  description:
    "A Meteora launch preset priced in the Nasdaq 100: every trading fee is stock, and every fee goes straight into a Scrip Plan that matches real people's automatic savings.",
};

const REPO = "https://github.com/shariqazeem/scrip/blob/main";

/** Nasdaq 100 base units, as a person reads them: "0.0100". */
function units(raw: bigint | null | undefined): string {
  if (raw === null || raw === undefined) return "—";
  return (Number(raw) / 10 ** CURVE_QUOTE.decimals).toFixed(4);
}

/**
 * /CURVE — the Meteora entry, off the main nav.
 *
 * Launches on Meteora's Dynamic Bonding Curve, priced in the Nasdaq 100 (xStocks QQQx, which
 * Meteora has badged for DBC and DAMM v2), whose every fee goes into a Scrip Plan that matches
 * savers' automatic saves. The page reads the Plan, the launches and every fee transfer from the
 * chain, says what has been proven and how, and makes no claim about any launch's price.
 */
export default async function CurvePage() {
  const read = readCurve();
  const [plan, launches] = await Promise.all([read.plan, read.launches]);
  const configs = Object.entries(DEPLOYED.configs);
  const badges = [
    { k: "Meteora DBC", v: tokenBadge(DBC_PROGRAM_ID, CURVE_QUOTE_MINT).toBase58() },
    { k: "Meteora DAMM v2", v: tokenBadge(DAMM_V2_PROGRAM_ID, CURVE_QUOTE_MINT).toBase58() },
  ];
  return (
    <SiteFrame
      eyebrow="Scrip Curve"
      title="Launches priced in the Nasdaq 100, whose fees match savers."
      lede="A launch preset on Meteora's Dynamic Bonding Curve where every buy pays in tokenized Nasdaq 100 and every trading fee is stock. Each fee goes straight from the curve into a Scrip Plan, and the Plan, enforced by Scrip's program, adds it to real people's automatic savings."
    >
      <SiteSection label="The money trail">
        <MoneyTrail />
        <div className="sp-truths">
          <Row k="1. A trade pays in stock">
            The curve&rsquo;s quote is the Nasdaq 100 (xStocks <span className="mono">QQQx</span>), so a buy pays in it and the fee is charged in it. The fee
            starts at {PRESET.startingFeeBps / 100}% and falls to {PRESET.endingFeeBps / 100}% over the first hour: a sniper pays the savers, a holder does not.
          </Row>
          <Row k="2. Straight into a Plan">
            Meteora&rsquo;s own <span className="mono">claim_trading_fee</span>, with a Scrip Plan as the receiver, moves the partner fee from the curve&rsquo;s
            vault into the Plan&rsquo;s escrow, which is the Plan&rsquo;s own Nasdaq 100 account. One instruction; no wallet holds the fee in between.
            Scrip&rsquo;s saving service signs it every half hour.
          </Row>
          <Row k="3. The Plan matches savers">
            Every automatic save a member of the Plan makes is matched from that escrow, in the same stock, by Scrip&rsquo;s program: a share of the save,
            capped each month, priced against Pyth, never taken back.
          </Row>
          <Row k="4. Graduation keeps paying">
            At {THRESHOLD_QUOTE.demonstration} Nasdaq 100 (a demonstration; {THRESHOLD_QUOTE.public} on the public preset) the curve graduates to a Meteora DAMM
            v2 pool, launch token and Nasdaq 100, all liquidity locked for good. The locked partner position&rsquo;s fees go to the same Plan with
            DAMM v2&rsquo;s <span className="mono">claim_position_fee</span>, and the partner&rsquo;s {PRESET.migrationFeePercentage}% graduation fee is moved in
            the same minute it is withdrawn.
          </Row>
          <Row k="5. Every step is a transaction">Each fee below links the transaction that moved it; each match is on the saver&rsquo;s own receipt.</Row>
        </div>
      </SiteSection>

      <SiteSection label="Live, from the chain">
        {plan ? (
          <div className="sp-truths">
            <Row k="The Plan">
              <a href={explorerUrl("address", plan.address)}>{plan.name ?? short(plan.address)}</a>
              {plan.sponsorHandle ? `, sponsored by @${plan.sponsorHandle}` : ""}. Its escrow{" "}
              <a href={explorerUrl("address", plan.escrow)}>{short(plan.escrow)}</a> holds <span className="mono">{units(plan.escrowRaw)}</span> Nasdaq 100.
            </Row>
            <Row k="From launches">
              <span className="mono">{units(plan.fromLaunchesRaw)}</span> Nasdaq 100 in {plan.inflows.length} transfer{plan.inflows.length === 1 ? "" : "s"}.
            </Row>
            <Row k="Matched">
              {plan.matches > 0 ? (
                <>
                  {plan.matches} automatic save{plan.matches === 1 ? "" : "s"} matched, <span className="mono">{units(plan.matchedRaw)}</span> Nasdaq 100 (
                  {usdc(plan.matchedUsdc)}), to {plan.members} member{plan.members === 1 ? "" : "s"}.
                </>
              ) : (
                <>
                  {plan.members} member{plan.members === 1 ? "" : "s"}; no save matched from it yet. A match lands seconds after a member&rsquo;s automatic save,
                  whenever a price can be verified.
                </>
              )}
            </Row>
            {plan.inflows.slice(0, 8).map((f) => (
              <Row key={f.sig} k={dateUTC(f.at)}>
                <a href={explorerUrl("tx", f.sig)}>
                  <span className="mono">+{units(f.raw)}</span> Nasdaq 100 from {f.from}
                </a>
              </Row>
            ))}
            {configs.map(([kind, c]) => (
              <Row key={kind} k={`The ${kind} config`}>
                <a href={explorerUrl("address", c.address)}>{short(c.address)}</a>, created in <a href={explorerUrl("tx", c.createdSig)}>{short(c.createdSig)}</a>.
              </Row>
            ))}
            {launches.map((l) => (
              <Row key={l.pool} k={`${l.name} (${l.symbol})`}>
                {l.kind === "demonstration" ? "A demonstration launch, never called a Scrip token; every buy so far is Scrip's founder's own. " : ""}Curve{" "}
                <a href={explorerUrl("address", l.pool)}>{short(l.pool)}</a>
                {l.quoteReserveRaw !== null ? (
                  <>
                    : <span className="mono">{units(l.quoteReserveRaw)}</span> of <span className="mono">{units(l.thresholdRaw)}</span> Nasdaq 100
                  </>
                ) : null}
                {l.migrated && l.dammPool ? (
                  <>
                    , graduated to DAMM v2 pool <a href={explorerUrl("address", l.dammPool)}>{short(l.dammPool)}</a>
                  </>
                ) : null}
                {l.feeWaitingRaw !== null && l.feeWaitingRaw > 0n ? (
                  <>
                    ; <span className="mono">{units(l.feeWaitingRaw)}</span> of fee waiting for the next move into the Plan
                  </>
                ) : null}
                .
              </Row>
            ))}
          </div>
        ) : (
          <p className="sp-body">
            Nothing is on mainnet yet. The Plan, the config and a demonstration launch are created by Scrip&rsquo;s founder with the open-source script
            below; this page reads them from the chain the moment they exist.
          </p>
        )}
      </SiteSection>

      <SiteSection label="Why the Nasdaq 100">
        <div className="sp-truths">
          <Row k="A stock-pair">
            Meteora asks for launch mechanics tuned to tokenized stocks. Pricing a launch in one makes every fee a share of the index, and a Plan&rsquo;s
            escrow holds the same stock, so a fee needs no swap to reach a saver.
          </Row>
          <Row k="Permissionless today">
            xStocks carry a permanent delegate and a pause authority, which Meteora allows only with a token badge. Both badges for{" "}
            <span className="mono">QQQx</span> exist on mainnet:{" "}
            {badges.map((b, i) => (
              <span key={b.k}>
                {i > 0 ? " and " : ""}
                {b.k} <a href={explorerUrl("address", b.v)}>{short(b.v)}</a>
              </span>
            ))}
            .
          </Row>
          <Row k="Not a vault">
            Meteora&rsquo;s Dynamic Fee Sharing vault accepts only plain mints and refuses an xStock, so the claim names the Plan directly instead. Fewer
            moving parts, and the fee never sits anywhere but the Plan.
          </Row>
        </div>
      </SiteSection>

      <SiteSection label="The preset">
        <div className="sp-truths">
          <Row k="Quote">The Nasdaq 100, <span className="mono">QQQx</span>, issued by Backed (xStocks): the issuer can freeze or move it, and dividends are reinvested.</Row>
          <Row k="Fee">
            {PRESET.startingFeeBps / 100}% falling to {PRESET.endingFeeBps / 100}% over an hour, collected in the quote. On a demonstration the launcher keeps
            none of it; on the public preset, {PRESET.creatorTradingFeePercentage.public}%.
          </Row>
          <Row k="Graduation">
            To Meteora DAMM v2 at {THRESHOLD_QUOTE.public} Nasdaq 100 ({THRESHOLD_QUOTE.demonstration} for a demonstration), a{" "}
            {PRESET.migrationFeePercentage}% graduation fee, the graduated pool collecting its fee in the Nasdaq 100.
          </Row>
          <Row k="Liquidity">Every position locked for good at graduation: nobody can pull the pool, and the locked partner position keeps paying the Plan.</Row>
          <Row k="Token">A plain SPL token with immutable metadata and no mint authority: nobody can mint more after launch.</Row>
        </div>
      </SiteSection>

      <SiteSection label="Proven before it ran">
        <ul>
          <li>
            <strong>On Meteora&rsquo;s own programs:</strong> <span className="mono">npm run curve:rehearse</span> boots a local validator holding the mainnet DBC
            and DAMM v2 programs, Token-2022, the Nasdaq 100 mint and both badges, and runs the founder&rsquo;s exact commands: the Plan, the config, a launch,
            buys, the fees into the Plan, graduation, a trade on the graduated pool and its fee into the Plan. Every step passes.
          </li>
          <li>
            <strong>Simulated on mainnet:</strong> creating the config priced in the Nasdaq 100 with Meteora&rsquo;s badge, and opening the Plan.
          </li>
          <li>
            <strong>The code:</strong> <a href={`${REPO}/src/lib/curve/preset.ts`}>preset.ts</a>, <a href={`${REPO}/src/lib/curve/claims.ts`}>claims.ts</a>,{" "}
            <a href={`${REPO}/scripts/curve.ts`}>curve.ts</a>, <a href={`${REPO}/scripts/curve-rehearse.sh`}>curve-rehearse.sh</a>.
          </li>
          <li>
            <strong>What rests on trust:</strong> the claim is signed by Scrip&rsquo;s saving service, which Meteora lets choose the receiver; it only ever names
            the Plan, and every claim is public. A Scrip program instruction that claims into the Plan by itself is the next step.
          </li>
        </ul>
      </SiteSection>

      <SiteSection label="Before you trade a launch">
        <p className="sp-body">
          <strong>A launch is a speculative token. Scrip makes no claim about its price; it guarantees only where its fees go.</strong> A demonstration launch
          exists to show the route, is never called a Scrip token, and is not promoted.
        </p>
        <p className="sp-body">
          <Link href="/teams">Plans, for whoever pays you</Link>
        </p>
      </SiteSection>
    </SiteFrame>
  );
}

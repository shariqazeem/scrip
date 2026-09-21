import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { Row, SiteFrame, SiteSection } from "@/components/site/site-frame";
import { db } from "@/lib/db";
import { multipliers } from "@/lib/db/schema";
import { dateUTC } from "@/lib/format";
import { market } from "@/lib/market";

export const metadata: Metadata = { title: "Corporate actions", description: "Dividend multipliers per asset, their effective times, and what the register did about them: nothing, because it is automatic." };
export const dynamic = "force-dynamic";

export default async function ActionsPage() {
  const [mkt, recorded] = await Promise.all([market(), db.select().from(multipliers).orderBy(desc(multipliers.effectiveAt)).limit(40)]);
  const rows = mkt.rows.filter((r) => r.multiplier !== null || r.multiplierWhy !== null);
  return (
    <SiteFrame eyebrow="Corporate actions" title="Dividends, splits, and what the register did about them." lede="xStocks handle dividends and splits with a mint-level multiplier that rebases balances. Store raw balances and a dividend reads as a gain; a split reads as a 300% return. The register stores multiplier-adjusted quantities, reconciles on every change, and shows the reconciliation." wide>
      <SiteSection label="The multipliers, now" aside="read from the mint on mainnet">
        <div className="sp-truths">
          {rows.length === 0 ? <Row k="—">No registered mint carries a multiplier on this cluster.</Row> : null}
          {rows.map((r) => (
            <Row key={r.mint} k={r.symbol}>
              {r.multiplier ? (
                <>
                  <span className="mono">×{Number(r.multiplier).toFixed(9)}</span> in force. A holder&rsquo;s share-equivalents are raw units times this; the register shows share-equivalents so a dividend never reads as a gain.
                </>
              ) : (
                <>Could not be read: {r.multiplierWhy}</>
              )}
            </Row>
          ))}
        </div>
      </SiteSection>
      <SiteSection label="Every change the watcher recorded" aside={`${recorded.length}`}>
        {recorded.length === 0 ? (
          <p className="sp-body">None yet on this deployment. The watcher records each new multiplier with its effective time the first time it is seen; the ledger keeps them forever.</p>
        ) : (
          <div className="sp-truths">
            {recorded.map((m) => (
              <Row key={`${m.mint}-${m.effectiveAt}`} k={dateUTC(m.effectiveAt)}>
                <span className="mono">{m.mint.slice(0, 6)}…</span> → <span className="mono">×{m.value}</span>, seen {dateUTC(m.seenAt)} from {m.source}
              </Row>
            ))}
          </div>
        )}
      </SiteSection>
      <SiteSection label="What the register does">
        <ul>
          <li>Reads the mint&rsquo;s scaled-UI extension: the multiplier in force, and a pending one with the instant it activates. The obvious field reads 0.18% low; the register reads the one in force.</li>
          <li>Prices a sweep&rsquo;s minimum through the live multiplier when the feed prices a share, so a fill is never judged against a rebased number.</li>
          <li>Vests grants on raw units, so a dividend reinvested while the stock waits goes to whoever the units vest to.</li>
          <li>Measures keep-rate on raw units, so a rebase never reads as a sale.</li>
        </ul>
        <p className="sp-body">
          <Link href="/docs/corporate-actions" className="sp-inline-link">The engineering note</Link>, with the activation observed on chain.
        </p>
      </SiteSection>
    </SiteFrame>
  );
}

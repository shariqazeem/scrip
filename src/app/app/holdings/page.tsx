import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { SignOut } from "@/components/auth/connect";
import { SavingsHead, SignInPanel } from "@/components/app/savings-home";
import { GrantBar } from "@/components/org/grant-bar";
import { liveView } from "@/lib/book/live";
import { dateUTC, short, unitsFromRaw } from "@/lib/format";
import { readStockHoldings } from "@/lib/save/holdings";
import { savingsTotals } from "@/lib/save/totals";
import { currentOwner } from "@/lib/session/server";
import "@/components/org/org.css";

export const metadata: Metadata = { title: "Stocks" };
export const dynamic = "force-dynamic";

/**
 * YOUR STOCKS — every stock in this wallet that Scrip knows, whoever put it there, with what
 * it is worth today at Jupiter's price; then every grant vesting to this wallet, with its
 * schedule. Units are the token's own, the figure every receipt prints.
 */
export default async function HoldingsPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Stocks" title="Your stocks">
        <SignInPanel lead="Sign in with the Solana wallet you save from to see every stock in it. It is a signature, not a transaction: nothing moves." />
      </PageFrame>
    );
  }
  const [v, stocks, totals] = await Promise.all([liveView(owner, { refresh: false }), readStockHoldings(owner), savingsTotals(owner)]);
  const now = Math.floor(Date.now() / 1000);
  const vesting = v.ok ? v.value.vesting : [];
  return (
    <PageFrame
      eyebrow={v.ok && v.value.handle ? `@${v.value.handle}` : "Stocks"}
      title="Your stocks"
      sub="In your own wallet, whoever put them there. Dollars are Jupiter's price right now, for display; stocks go down as well as up, and these tokens reinvest dividends rather than pay them."
      actions={<SignOut />}
    >
      <SavingsHead holdings={stocks.ok ? stocks.value : []} totals={totals} why={stocks.ok ? null : stocks.why} />
      {stocks.ok && stocks.value.length === 0 ? (
        <p className="sp-register-empty">
          No stocks in this wallet yet. <Link href="/app/save">Your first save</Link> puts one here, in an account only you control.
        </p>
      ) : null}
      <div className="sp-org">
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Vesting to you</span>
            <span>{vesting.length}</span>
          </p>
          {vesting.length === 0 ? (
            <p className="sp-register-empty">No grant is vesting to this wallet. When an organisation grants you stock on a schedule, it appears here with its cliff and its next vest.</p>
          ) : (
            <div className="sp-org-rows">
              {vesting.map((g) => (
                <div key={g.pda} className="sp-org-row" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
                  <span className="what">
                    <Link href={`/grant/${g.pda}`}>
                      {g.decimals !== null ? unitsFromRaw(BigInt(g.totalRaw), g.decimals) : g.totalRaw} {g.symbol}
                    </Link>{" "}
                    from {g.payerHandle ? `@${g.payerHandle}` : short(g.payer)}
                    {g.reason ? <span className="why"> · “{g.reason}”</span> : null}
                    <span className="why"> · {g.state === "revoked" ? "revoked; what had accrued still vests" : `cliff ${dateUTC(g.startUnix + g.cliffSecs)}`}</span>
                  </span>
                  <GrantBar totalRaw={BigInt(g.totalRaw)} releasedRaw={BigInt(g.releasedRaw)} startUnix={g.startUnix} cliffSecs={g.cliffSecs} durationSecs={g.durationSecs} now={now} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

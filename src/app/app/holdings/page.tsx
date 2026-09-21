import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { GrantBar } from "@/components/org/grant-bar";
import { liveView } from "@/lib/book/live";
import { dateUTC, short, unitsFromRaw, usd } from "@/lib/format";
import { currentOwner } from "@/lib/session/server";
import "@/components/org/org.css";

export const metadata: Metadata = { title: "Holdings" };
export const dynamic = "force-dynamic";

/**
 * HOLDINGS — units first. What the register holds, share-equivalents through the live
 * multiplier, what is worth today on Jupiter, and every grant vesting to this wallet with
 * its schedule. Dividends explained per row.
 */
export default async function HoldingsPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Holdings" title="What your register holds." sub="Sign in first.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const v = await liveView(owner, { refresh: false });
  if (!v.ok) {
    return (
      <PageFrame eyebrow="Holdings" title="What your register holds." actions={<SignOut />}>
        <p className="sp-register-empty">{v.why}</p>
      </PageFrame>
    );
  }
  const view = v.value;
  const now = Math.floor(Date.now() / 1000);
  return (
    <PageFrame eyebrow={view.handle ? `@${view.handle}` : "Holdings"} title="What your register holds." sub="Units first; dollars only where a live price exists, and labelled as display. Vesting grants sit in escrows you can see." actions={<SignOut />}>
      <div className="sp-org">
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Owned, in your own token accounts</span>
            <span>share-equivalents through the live multiplier</span>
          </p>
          {view.holdings.length === 0 ? (
            <p className="sp-register-empty">Nothing yet. The first sweep or payment puts stock here, in an account only you control.</p>
          ) : (
            <div>
              {view.holdings.map((h) => {
                const worth = view.asset && h.mint === view.asset.mint && view.priceUsd !== null ? (Number(h.qtyRaw) / 10 ** h.decimals) * view.priceUsd : null;
                return (
                  <p key={h.mint} className="sp-fact">
                    <span className="k">
                      {h.symbol}
                      <span className="sp-fact-note" style={{ display: "block" }}>
                        {h.multiplier !== "1" && h.multiplier !== "unknown" ? `multiplier ×${Number(h.multiplier).toFixed(6)}: dividends reinvested, not paid` : h.multiplier === "unknown" ? "multiplier unread; raw units shown" : "no multiplier on this mint"}
                      </span>
                    </span>
                    <span className="v is-big">
                      {unitsFromRaw(BigInt(h.qtyAdjusted), h.decimals)}
                      <span className="unit">{h.symbol}</span>
                      {worth !== null ? <span className="unit">≈ {usd(worth)} on Jupiter</span> : null}
                    </span>
                  </p>
                );
              })}
              <p className="sp-fact-note">{unitsFromRaw(BigInt(view.holdings[0]?.qtyRaw ?? "0"), view.holdings[0]?.decimals ?? 0) === "" ? "" : "Raw units are what the token account holds; the register shows share-equivalents so a dividend never reads as a gain."}</p>
            </div>
          )}
        </section>

        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Vesting to you</span>
            <span>{view.vesting.length}</span>
          </p>
          {view.vesting.length === 0 ? (
            <p className="sp-register-empty">No grant is vesting to this wallet. When an organisation grants you stock on a schedule, it appears here with its cliff and its next vest.</p>
          ) : (
            <div className="sp-org-rows">
              {view.vesting.map((g) => (
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

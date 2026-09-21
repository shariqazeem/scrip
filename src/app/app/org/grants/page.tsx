import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { GrantActions } from "@/components/org/grant-actions";
import { GrantBar } from "@/components/org/grant-bar";
import { GrantForm } from "@/components/org/grant-form";
import { ruleAssets } from "@/lib/assets/registry";
import { short, unitsFromRaw, usdc } from "@/lib/format";
import { orgView } from "@/lib/org/view";
import { currentOwner } from "@/lib/session/server";
import { cluster } from "@/lib/solana/cluster";
import "@/components/org/org.css";
import "../../../pay/pay.css";

export const metadata: Metadata = { title: "Grants" };
export const dynamic = "force-dynamic";

/** GRANTS — stock that vests. The retention instrument public companies have, for anyone. */
export default async function GrantsPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Pay in stock" title="Grant stock that vests." sub="Sign in with the wallet that grants.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const v = await orgView(owner);
  const grants = v.ok ? v.value.grants : [];
  const now = Math.floor(Date.now() / 1000);
  return (
    <PageFrame eyebrow="Pay in stock" title="Grant stock that vests." sub="Bought now, vesting on a schedule you set, from anyone to anyone, in any listed company on the registry. Keepers vest it; the recipient sees it in their register under vesting; a revoked grant returns only what had not vested." actions={<SignOut />}>
      <div className="sp-org">
        <GrantForm owner={owner} cluster={cluster()} assets={ruleAssets().filter((a) => !a.singleName || true).map((a) => ({ mint: a.mint, symbol: a.symbol, name: a.name }))} />
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Your grants</span>
            <span>{grants.length}</span>
          </p>
          {grants.length === 0 ? (
            <p className="sp-register-empty">No grant yet. The first one appears here with its schedule, and on its own page at /grant/… that anyone can open.</p>
          ) : (
            <div className="sp-org-rows">
              {grants.map((g) => (
                <div key={g.pda} className="sp-org-row" style={{ gridTemplateColumns: "minmax(120px, 0.7fr) minmax(0, 2fr) auto" }}>
                  <span className="who">
                    <Link href={`/grant/${g.pda}`}>{g.recipientHandle ? `@${g.recipientHandle}` : short(g.recipient)}</Link>
                  </span>
                  <span className="what">
                    {g.decimals !== null ? unitsFromRaw(BigInt(g.totalRaw), g.decimals) : g.totalRaw} {g.symbol} for {usdc(BigInt(g.declaredUsdc))}
                    {g.reason ? <span className="why"> · “{g.reason}”</span> : null}
                    <span className="why"> · {g.state}{g.revocable ? ", revocable" : ""}</span>
                  </span>
                  <GrantActions owner={owner} cluster={cluster()} pda={g.pda} state={g.state} revocable={g.revocable} sealed={g.sealed} />
                  <GrantBar totalRaw={BigInt(g.totalRaw)} releasedRaw={BigInt(g.releasedRaw)} startUnix={g.startUnix} cliffSecs={g.cliffSecs} durationSecs={g.durationSecs} now={now} compact />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageFrame>
  );
}

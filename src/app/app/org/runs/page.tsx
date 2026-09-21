import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { RunBuilder } from "@/components/org/run-builder";
import { dateUTC, usdc } from "@/lib/format";
import { orgView } from "@/lib/org/view";
import { currentOwner } from "@/lib/session/server";
import { cluster } from "@/lib/solana/cluster";
import "@/components/org/org.css";
import "../../../pay/pay.css";

export const metadata: Metadata = { title: "Runs" };
export const dynamic = "force-dynamic";

/** PAY MANY — a run: paste, review, sign once, a page with every receipt. */
export default async function RunsPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Pay in stock" title="Pay a whole team in one run." sub="Sign in with the wallet that pays.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const v = await orgView(owner);
  const runs = v.ok ? v.value.runs : [];
  return (
    <PageFrame eyebrow="Pay in stock" title="Pay many, in a run." sub="One line per person. Review every quote, sign once for the whole run, and get a page that lists everyone with their receipt. A run is a payslip for a team." actions={<SignOut />}>
      <div className="sp-org">
        <RunBuilder owner={owner} cluster={cluster()} />
        {runs.length > 0 ? (
          <section className="sp-org-section">
            <p className="sp-section-label">
              <span>Past runs</span>
              <span>{runs.length}</span>
            </p>
            <div className="sp-org-rows">
              {runs.map((r) => (
                <Link key={r.id} href={`/run/${r.id}`} className="sp-org-row">
                  <span className="who">{r.label || `Run ${r.id.slice(0, 6)}`}</span>
                  <span className="what">
                    {r.settled} of {r.planned} settled, {usdc(BigInt(r.paidUsdc))}
                  </span>
                  <span className="when">{dateUTC(r.lastAt)}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PageFrame>
  );
}

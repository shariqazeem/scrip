import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { statementsFor } from "@/lib/book/statements";
import { unitsFromRaw, usdc } from "@/lib/format";
import { currentOwner } from "@/lib/session/server";
import "@/components/org/org.css";

export const metadata: Metadata = { title: "Statements" };
export const dynamic = "force-dynamic";

/** MONTHLY STATEMENTS — one per month with a receipt, rendered as the stub; printable. */
export default async function StatementsPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Statements" title="A statement a month." sub="Sign in first.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const statements = await statementsFor(owner);
  return (
    <PageFrame eyebrow="Statements" title="A statement a month." sub="What landed, what became stock, at what prices, what is held. Arithmetic on receipts; it projects nothing. Each one prints." actions={<SignOut />}>
      <div className="sp-org">
        {statements.length === 0 ? (
          <p className="sp-register-empty">No month has a receipt yet. The first arrival starts the first statement.</p>
        ) : (
          <div className="sp-org-rows">
            {statements.map((s) => (
              <Link key={s.ym} href={`/app/statements/${s.ym}`} className="sp-org-row">
                <span className="who">{s.label}</span>
                <span className="what">
                  {s.landedUsdc > 0n ? `${usdc(s.landedUsdc)} landed under the rule, ` : ""}
                  {usdc(s.becameUsdc)} became stock: {s.unitsByAsset.map((u) => `${u.decimals !== null ? unitsFromRaw(u.amountRaw, u.decimals) : u.amountRaw} ${u.symbol}`).join(", ")}
                </span>
                <span className="when">
                  {s.lines.length} receipt{s.lines.length === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

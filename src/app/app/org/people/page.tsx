import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { dateUTC, short, usdc } from "@/lib/format";
import { orgView } from "@/lib/org/view";
import { currentOwner } from "@/lib/session/server";
import "@/components/org/org.css";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

/** EVERYONE THIS WALLET HAS PAID, with their public page where they opted in. */
export default async function PeoplePage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Pay in stock" title="People you have paid." sub="Sign in first.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const v = await orgView(owner);
  const people = v.ok ? v.value.people : [];
  return (
    <PageFrame eyebrow="Pay in stock" title="People you have paid." sub="By handle where they published their register; otherwise by address. Every figure is from receipts." actions={<SignOut />}>
      <div className="sp-org">
        {people.length === 0 ? (
          <p className="sp-register-empty">Nobody yet. Pay one person, or run a whole team, and they appear here.</p>
        ) : (
          <div className="sp-org-rows">
            {people.map((p) => (
              <Link key={p.owner} href={p.handle ? `/@${p.handle}` : `/pay/${p.owner}`} className="sp-org-row">
                <span className="who">{p.handle ? `@${p.handle}` : short(p.owner)}</span>
                <span className="what">
                  {p.payments} payment{p.payments === 1 ? "" : "s"}, {usdc(BigInt(p.paidUsdc))} since {dateUTC(p.firstAt)}
                </span>
                <span className="when">{dateUTC(p.lastAt)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

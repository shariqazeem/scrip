import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { StubFromRow } from "@/components/stub/from-row";
import { resolveAssets } from "@/lib/assets/stand-in";
import { receiptsFor } from "@/lib/ledger/indexer";
import { currentOwner } from "@/lib/session/server";
import "@/components/org/org.css";

export const metadata: Metadata = { title: "Receipts" };
export const dynamic = "force-dynamic";

const KINDS = ["all", "sweep", "pay", "gift", "vest", "grant"] as const;
const LABEL: Record<(typeof KINDS)[number], string> = { all: "All", sweep: "Swept", pay: "Paid", gift: "Gifted", vest: "Vested", grant: "Granted" };

/** EVERY STUB, filterable by kind, exportable. Each is an account anyone can open. */
export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Receipts" title="Every receipt, yours." sub="Sign in first.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const { kind } = await searchParams;
  const which = (KINDS as readonly string[]).includes(kind ?? "") ? (kind as (typeof KINDS)[number]) : "all";
  const rows = (await receiptsFor(owner, 500)).filter((r) => which === "all" || r.kind === which);
  const labels = await resolveAssets(rows.map((r) => r.asset));
  return (
    <PageFrame eyebrow="Receipts" title="Every receipt, yours." sub="What landed, what it became, at what price, and whether it is still held. Filter by kind; export the lot for whoever does your books." actions={<SignOut />}>
      <div className="sp-org">
        <div className="sp-actions">
          {KINDS.map((k) => (
            <Link key={k} href={k === "all" ? "/app/receipts" : `/app/receipts?kind=${k}`} className={`sp-choice${which === k ? " on" : ""}`}>
              {LABEL[k]}
            </Link>
          ))}
          <a href="/api/me/export" className="sp-action is-quiet" download>
            Export CSV
          </a>
        </div>
        {rows.length === 0 ? (
          <p className="sp-register-empty">{which === "all" ? "No receipt yet. The first arrival under your rule, or the first payment to you, prints here." : `Nothing of that kind yet.`}</p>
        ) : (
          <div className="stub-wall">
            {rows.map((r) => (
              <StubFromRow key={r.id} row={r} compact showHeld resolve={(m) => labels.get(m) ?? null} />
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}

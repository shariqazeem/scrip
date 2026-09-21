import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScripMark } from "@/components/brand/scrip-mark";
import { StubFromRow } from "@/components/stub/from-row";
import { dateUTC, short, usdc } from "@/lib/format";
import { runView } from "@/lib/org/view";
import { cluster } from "@/lib/solana/cluster";
import "../../pay/pay.css";
import "@/styles/app.css";
import "@/components/org/org.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const run = /^[0-9a-f]{32}$/.test(id) ? await runView(id) : null;
  if (!run) return { title: "Run" };
  return { title: run.label || `Run ${id.slice(0, 6)}`, description: `${run.settled} people paid in stock by ${run.payerHandle ? `@${run.payerHandle}` : short(run.payer)}, ${usdc(BigInt(run.paidUsdc))} in all, every receipt open.` };
}

/** A PAYROLL RUN — who was paid, in what, with every receipt. A payslip for a team. */
export default async function RunPage({ params }: Params) {
  const { id } = await params;
  if (!/^[0-9a-f]{32}$/.test(id)) notFound();
  const run = await runView(id);
  if (!run) notFound();
  const resolve = (m: string) => run.labels.get(m) ?? null;
  return (
    <main className="sp-pay">
      <div className="sp-pay-col">
        <div className="sp-pay-top">
          <Link href="/" className="sp-pay-brand" aria-label="Scrip">
            <ScripMark size={20} />
            Scrip
          </Link>
          <span className="mono">{cluster() === "mainnet-beta" ? "Solana" : cluster()}</span>
        </div>
        <div className="sp-org">
          <header className="sp-org-head">
            <p className="sp-page-eyebrow">
              A run by <Link href={`/@${run.payerHandle ?? run.payer}`}>{run.payerHandle ? `@${run.payerHandle}` : short(run.payer)}</Link>
            </p>
            <h1 className="sp-org-h1">{run.label || `Run ${id.slice(0, 6)}`}</h1>
            <p className="sp-org-lede">
              {run.settled} of {run.planned} paid in stock, {usdc(BigInt(run.paidUsdc))} in all
              {run.rows[0] ? `, ${dateUTC(run.rows[0].settledUnix)}` : ""}. Each line is a receipt anyone can open, with its reason.
            </p>
          </header>
          {run.rows.length === 0 ? (
            <p className="sp-register-empty">Nothing from this run has settled yet. Receipts appear here as each payment lands.</p>
          ) : (
            <div className="stub-wall">
              {run.rows.map((r) => (
                <StubFromRow key={r.id} row={r} handle={run.handleOf.get(r.recipient) ?? null} compact resolve={resolve} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { PrintButton } from "@/components/app/print-button";
import { monthLabel, statementsFor } from "@/lib/book/statements";
import { bps, dateUTC, short, unitsFromRaw, usdc } from "@/lib/format";
import { currentOwner } from "@/lib/session/server";
import "@/components/org/org.css";
import "./statement.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ ym: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { ym } = await params;
  return { title: `Statement, ${monthLabel(ym)}` };
}

/** ONE MONTH, AS THE STUB: what landed, what became stock, at what prices, held or not. Prints to a page. */
export default async function StatementPage({ params }: Params) {
  const { ym } = await params;
  if (!/^\d{4}-\d{2}$/.test(ym)) notFound();
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Statement" title={monthLabel(ym)} sub="Sign in first.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const s = (await statementsFor(owner)).find((x) => x.ym === ym);
  if (!s) {
    return (
      <PageFrame eyebrow="Statement" title={monthLabel(ym)} sub="No receipt printed for this register in this month. A statement is arithmetic on receipts; with none, there is nothing to state." actions={<SignOut />}>
        <p className="sp-register-empty">
          <Link href="/app/statements">Every month that has one</Link>
        </p>
      </PageFrame>
    );
  }
  return (
    <PageFrame eyebrow="Statement" title="" actions={<><PrintButton /><SignOut /></>}>
      <article className="sp-statement">
        <div className="stub-head">
          <span className="settled">
            <span className="dot" aria-hidden />
            Statement, from receipts
          </span>
          <span>Scrip</span>
        </div>
        <h1 className="sp-statement-h1">{s.label}</h1>
        <p className="sp-statement-sub">
          {dateUTC(s.fromUnix)} to {dateUTC(s.toUnix)} · register <span className="mono">{short(owner)}</span>
        </p>
        <hr className="stub-rule" />
        <div className="sp-statement-facts">
          {s.landedUsdc > 0n ? (
            <p className="stub-row">
              <span className="k">Landed under the rule</span>
              <span className="v">{usdc(s.landedUsdc)}</span>
            </p>
          ) : null}
          <p className="stub-row">
            <span className="k">Became stock</span>
            <span className="v">{usdc(s.becameUsdc)}</span>
          </p>
          {s.unitsByAsset.map((u) => (
            <p key={u.asset} className="stub-row">
              <span className="k">{u.symbol} received</span>
              <span className="v">
                {u.decimals !== null ? unitsFromRaw(u.amountRaw, u.decimals) : u.amountRaw.toString()} at about {u.amountRaw > 0n && u.decimals !== null ? usdc((u.paidUsdc * BigInt(10 ** u.decimals)) / u.amountRaw) : "—"} each
              </span>
            </p>
          ))}
          <p className="stub-row">
            <span className="k">Receipts</span>
            <span className="v">
              {s.sweeps} swept, {s.payments} paid, {s.vests} vested
            </span>
          </p>
        </div>
        <hr className="stub-rule" />
        <table className="sp-statement-table">
          <thead>
            <tr>
              <th>Settled</th>
              <th>Kind</th>
              <th className="num">Basis</th>
              <th className="num">Rate</th>
              <th className="num">Became</th>
              <th className="num">Units</th>
              <th>For</th>
              <th>Receipt</th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.id}>
                <td>{dateUTC(l.settledUnix)}</td>
                <td>{l.kind}</td>
                <td className="num">{usdc(l.basisUsdc)}</td>
                <td className="num">{l.kind === "sweep" ? bps(l.rateBps) : "—"}</td>
                <td className="num">{usdc(l.paidUsdc)}</td>
                <td className="num">
                  {l.decimals !== null ? unitsFromRaw(l.amountRaw, l.decimals) : l.amountRaw.toString()} {l.symbol}
                </td>
                <td>{l.reason || (l.kind === "sweep" ? "the rule" : l.payer ? `from ${short(l.payer)}` : "")}</td>
                <td>
                  <Link href={`/receipt/${l.sig}`} className="mono">
                    {l.sig.slice(0, 8)}…
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="stub-foot">Arithmetic on receipts that exist on chain. Prices are the receipts&rsquo; own. Nothing here is a projection, a yield, or advice. Still-held is measured at 7 and 30 days on each receipt.</p>
      </article>
    </PageFrame>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { OpenOrg } from "@/components/org/open-org";
import { dateUTC, short, since, unitsFromRaw, usdc } from "@/lib/format";
import { orgView } from "@/lib/org/view";
import { currentOwner } from "@/lib/session/server";
import "@/components/org/org.css";

export const metadata: Metadata = { title: "Pay in stock" };
export const dynamic = "force-dynamic";

/**
 * THE ORGANISATION'S HOME — people paid, stock delivered, grants vesting, the last run. Any
 * signed-in wallet can pay in stock; an organisation's register (a handle of kind "org")
 * gives it a public page that recruits.
 */
export default async function OrgHome() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Pay in stock" title="Pay one person, or a whole team, in ownership." sub="Sign in with the wallet that pays. A signature, not a transaction.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  const v = await orgView(owner);
  if (!v.ok) {
    return (
      <PageFrame eyebrow="Pay in stock" title="Your organisation" actions={<SignOut />}>
        <p className="sp-register-empty">{v.why}</p>
      </PageFrame>
    );
  }
  const o = v.value;
  const now = Math.floor(Date.now() / 1000);
  return (
    <PageFrame eyebrow={o.handle ? `@${o.handle}${o.kind === "org" ? ", an organisation" : ""}` : "Pay in stock"} title="" actions={<SignOut />}>
      <div className="sp-org">
        <header className="sp-org-head">
          <h1 className="sp-org-h1">{o.payments > 0 ? `Paying in stock since ${dateUTC(o.since ?? now)}.` : "Pay one person, or a whole team, in ownership."}</h1>
          <p className="sp-org-lede">A slice or all of each payment becomes stock in their own wallet, with a receipt that carries the reason. A grant vests it on a schedule. Every payment recruits a register.</p>
          <div className="sp-live-actions">
            <Link href="/app/org/pay" className="sp-action is-primary">
              Pay one
            </Link>
            <Link href="/app/org/runs" className="sp-action">
              Pay many, in a run
            </Link>
            <Link href="/app/org/grants" className="sp-action">
              Grant stock that vests
            </Link>
          </div>
        </header>

        {!o.handle || o.kind !== "org" ? (
          <section className="sp-org-section">
            <p className="sp-section-label">
              <span>{o.handle ? "This wallet has a person's register" : "This wallet has no register"}</span>
            </p>
            {o.handle ? (
              <p className="sp-register-empty">
                You can pay, run and grant from here as <span className="mono">@{o.handle}</span>. An organisation with its own public page is its own wallet: sign in with it and open an organisation register there.
              </p>
            ) : (
              <OpenOrg owner={owner} />
            )}
          </section>
        ) : null}

        <section className="sp-org-facts">
          <Fact k="People paid" v={String(o.peoplePaid)} />
          <Fact k="Payments" v={String(o.payments)} />
          <Fact k="Paid, in dollars" v={usdc(BigInt(o.paidUsdc))} />
          {o.delivered.map((d) => (
            <Fact key={d.asset} k={`${d.symbol} delivered`} v={d.decimals !== null ? unitsFromRaw(BigInt(d.amountRaw), d.decimals) : d.amountRaw} />
          ))}
          <Fact k="Grants vesting" v={String(o.grantsActive)} />
          {o.runs[0] ? <Fact k="Last run" v={since(o.runs[0].lastAt, now * 1000)} note={`${o.runs[0].settled} people, ${usdc(BigInt(o.runs[0].paidUsdc))}`} /> : null}
        </section>

        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Recent payments</span>
            <Link href="/app/org/people">everyone you have paid</Link>
          </p>
          {o.recent.length === 0 ? (
            <p className="sp-register-empty">Nothing paid yet. The first payment settles with a receipt and appears here.</p>
          ) : (
            <div className="sp-org-rows">
              {o.recent.slice(0, 12).map((r) => (
                <Link key={r.id} href={`/receipt/${r.sig}`} className="sp-org-row">
                  <span className="who">{r.recipientHandle ? `@${r.recipientHandle}` : short(r.recipient)}</span>
                  <span className="what">
                    {r.kind === "grant" ? "granted " : r.kind === "vest" ? "vested " : ""}
                    {r.decimals !== null ? unitsFromRaw(BigInt(r.amountRaw), r.decimals) : r.amountRaw} {r.symbol}
                    {r.kind !== "vest" ? ` for ${usdc(BigInt(r.paidUsdc))}` : ""}
                    {r.reason ? <span className="why"> · “{r.reason}”</span> : null}
                  </span>
                  <span className="when">{since(r.settledUnix, now * 1000)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {o.handle && o.kind === "org" ? (
          <p className="sp-fact-note">
            Your public page: <Link href={`/@${o.handle}`}>/@{o.handle}</Link>. It names people only where they published their own register. <Link href="/app/org/settings">Settings and exports.</Link>
          </p>
        ) : null}
      </div>
    </PageFrame>
  );
}

function Fact({ k, v, note }: { k: string; v: string; note?: string }) {
  return (
    <div className="sp-ledger-fact">
      <p className="k">{k}</p>
      <p className="v">{v}</p>
      {note ? <p className="note">{note}</p> : null}
    </div>
  );
}

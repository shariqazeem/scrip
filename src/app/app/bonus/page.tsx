import type { Metadata } from "next";
import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { InviteForm } from "@/components/org/invite-form";
import { BONUS_REASON, BONUS_USD, bonusBudgetUsd, bonusesPaid, inviteRows, isOperator } from "@/lib/bonus";
import { short, usd } from "@/lib/format";
import { currentOwner } from "@/lib/session/server";
import "@/components/org/org.css";

export const metadata: Metadata = { title: "Welcome bonus" };
export const dynamic = "force-dynamic";

/**
 * THE WELCOME BONUS, FOR THE OPERATOR — invite a wallet, see whether it has saved, and pay its
 * $5 of S&P 500 through pay in stock with the reason "Welcome bonus from Scrip". The founder
 * signs every bonus in their own wallet; nothing here pays by itself. Paid or not is read from
 * the receipts, so the page cannot claim a bonus the chain does not show.
 */
export default async function BonusPage() {
  const owner = await currentOwner();
  if (!owner) {
    return (
      <PageFrame eyebrow="Welcome bonus" title="Sign in as an operator." sub="The invite list and the bonus payments are for Scrip's operators.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  if (!isOperator(owner)) {
    return (
      <PageFrame eyebrow="Welcome bonus" title="Not an operator." sub="This page is for the people who run Scrip's Welcome bonus." actions={<SignOut />}>
        <p className="sp-fact-note">Signed in as {short(owner)}.</p>
      </PageFrame>
    );
  }
  const [rows, paid] = await Promise.all([inviteRows(), bonusesPaid()]);
  const budget = bonusBudgetUsd();
  const left = Math.max(0, budget - paid.usd);
  return (
    <PageFrame
      eyebrow="Welcome bonus"
      title={`${usd(BONUS_USD)} of S&P 500 on an invited wallet's first save.`}
      sub={`Paid through pay in stock with the reason "${BONUS_REASON}", signed in your own wallet. Invite-only and one per wallet. ${paid.count} paid so far, ${usd(paid.usd)} of ${usd(budget)}; ${usd(left)} left.`}
      actions={<SignOut />}
    >
      <div className="sp-org">
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Invite a wallet</span>
          </p>
          <InviteForm />
        </section>
        <section className="sp-org-section">
          <p className="sp-section-label">
            <span>Invited</span>
            <span>{rows.length}</span>
          </p>
          {rows.length === 0 ? (
            <p className="sp-fact-note">No invites yet.</p>
          ) : (
            <div className="sp-org-rows">
              {rows.map((r) => (
                <div key={r.address} className="sp-org-row is-invite">
                  <span className="mono">{short(r.address)}</span>
                  <span>{r.label || "—"}</span>
                  <span>{r.saved > 0 ? `${r.saved} save${r.saved === 1 ? "" : "s"}` : "not saved yet"}{r.ruleOn ? ", every payment on" : ""}</span>
                  <span>
                    {r.paidSig ? (
                      <Link href={`/receipt/${r.paidSig}`}>paid</Link>
                    ) : r.saved === 0 ? (
                      "waits for a first save"
                    ) : left < BONUS_USD ? (
                      "budget spent"
                    ) : (
                      <Link href={`/app/org/pay?to=${r.address}&amount=${BONUS_USD}&reason=${encodeURIComponent(BONUS_REASON)}`}>Pay {usd(BONUS_USD)}</Link>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="sp-fact-note">
            A wallet with savings switched on receives the bonus at once, with a receipt. A wallet without them receives a claim link; it claims at its
            own cost. Never call a bonus a match.
          </p>
        </section>
      </div>
    </PageFrame>
  );
}

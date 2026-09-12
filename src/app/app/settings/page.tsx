import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { PolicyEditor } from "@/components/app/policy-editor";
import { ASSETS } from "@/lib/assets/registry";
import { loadBook } from "@/lib/book/read-book";
import { short } from "@/lib/format";
import { defaultPolicy } from "@/lib/policy";
import { currentOwner } from "@/lib/session/server";
import { clusterConfig, explorerUrl } from "@/lib/solana/cluster";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * THE MIX POLICY AND THE DISCLOSURES.
 *
 * No model, no operator and no program decides how much of anything anybody holds. Weights
 * come from a policy the owner signed, prices come from Pyth, routing comes from Jupiter.
 * This page is the only place in Webgold where a weight is chosen, and the choosing is done
 * by a person with their own key.
 */
export default async function SettingsPage() {
  const owner = await currentOwner();
  const fallback = defaultPolicy();

  if (!owner) {
    return (
      <PageFrame
        eyebrow="Settings"
        title="Your mix, signed by you."
        sub="Target weights must add up to 100%. The program enforces what you signed and has no discretion to do anything else."
      >
        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">Sign in to see your mix</span>
          </div>
          <div className="wg-panel-body">
            <ConnectWallet />
          </div>
        </div>
      </PageFrame>
    );
  }

  const book = await loadBook(owner);
  const policy = book.ok ? book.value.policy : null;

  return (
    <PageFrame
      eyebrow="Settings"
      title="Your mix, signed by you."
      sub="Target weights must add up to 100%. The program enforces what you signed and has no discretion to do anything else. A payer may restrict which assets their payout can become; never the proportions."
      actions={<SignOut />}
    >
      <div className="wg-stack">
        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">{policy ? "Your mix" : "Open a book"}</span>
            <span className="mono">{clusterConfig().label}</span>
          </div>
          <div className="wg-panel-body">
            {!book.ok ? (
              <EmptyState
                icon={<Settings size={22} strokeWidth={1.6} />}
                title="The chain could not be read just now"
                note={book.why}
              />
            ) : (
              <PolicyEditor owner={owner} current={policy ?? fallback} hasBook={policy !== null} />
            )}
          </div>
        </div>

        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">This book</span>
          </div>
          <div className="wg-rows">
            <div className="wg-pos">
              <span className="wg-pos-name">
                <span className="wg-pos-sym">Owner</span>
                <span className="wg-pos-issuer">The wallet that holds every constituent</span>
              </span>
              <span className="wg-pos-qty">
                <a href={explorerUrl("address", owner)} target="_blank" rel="noreferrer">
                  {short(owner)}
                </a>
              </span>
              <span className="wg-pos-val" />
            </div>
            <div className="wg-pos">
              <span className="wg-pos-name">
                <span className="wg-pos-sym">Book account</span>
                <span className="wg-pos-issuer">
                  Holds the policy and the receipts. Never an asset
                </span>
              </span>
              <span className="wg-pos-qty">
                {book.ok ? (
                  <a href={explorerUrl("address", book.value.pda)} target="_blank" rel="noreferrer">
                    {short(book.value.pda)}
                  </a>
                ) : (
                  "—"
                )}
              </span>
              <span className="wg-pos-val">{policy ? "open" : "not opened"}</span>
            </div>
          </div>
        </div>

        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">What each asset actually is</span>
          </div>
          <div className="wg-rows">
            {ASSETS.map((a) => (
              <div key={a.mint} className="wg-row">
                <div className="wg-row-id">
                  <span className="wg-row-sym">{a.symbol}</span>
                  <span className="wg-row-name">{a.issuer.name}</span>
                </div>
                <p className="wg-row-disclosure" style={{ gridColumn: "2" }}>
                  {a.disclosure}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

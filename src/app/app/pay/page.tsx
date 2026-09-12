import type { Metadata } from "next";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet } from "@/components/auth/connect";
import { PayForm } from "@/components/app/pay-form";
import { currentOwner } from "@/lib/session/server";
import { clusterConfig } from "@/lib/solana/cluster";

export const metadata: Metadata = { title: "Pay" };
export const dynamic = "force-dynamic";

/**
 * FUND AND RELEASE — one form, one confirm, one receipt.
 *
 * A payout carries a payer, a recipient, a dollar value, a reason and an optional constraint
 * on the asset SET. It never carries weights: the recipient's own signed policy decides what
 * the value becomes, and that split is computed on the server precisely so the payer cannot
 * choose it.
 *
 * Whether the reason was verified by a human, a model, or nobody at all is outside this
 * system. Webgold settles; it does not judge.
 */
type Search = Promise<{ to?: string; amount?: string; for?: string }>;

export default async function PayPage({ searchParams }: { searchParams: Search }) {
  const owner = await currentOwner();
  const q = await searchParams;

  if (!owner) {
    return (
      <PageFrame
        eyebrow="Pay"
        title="Release value. It lands as ownership."
        sub="A payout is denominated in dollars and settles into each recipient's own mix. Sign in with the wallet that will pay."
      >
        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">Sign in to pay</span>
          </div>
          <div className="wg-panel-body">
            <ConnectWallet />
          </div>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      eyebrow="Pay"
      title="Release value. It lands as ownership."
      sub="You set the amount, the reason, and optionally which assets it may become. Their signed policy sets the proportions. A receipt is written in the same transaction, so there is no state in which value moved and no record of it exists."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">New payout</span>
          <span className="mono">{clusterConfig().label}</span>
        </div>
        <div className="wg-panel-body">
          {/* A request link arrives as query parameters, so the payer lands on a form that
              is already filled in. Nothing here is trusted: the recipient is re-validated on
              the server when the quote is asked for, and the payer sees every field before
              they sign. */}
          <PayForm
            owner={owner}
            initial={{ to: q.to, amount: q.amount, reason: q.for }}
          />
        </div>
      </div>
    </PageFrame>
  );
}

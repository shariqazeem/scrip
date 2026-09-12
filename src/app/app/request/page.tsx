import type { Metadata } from "next";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet } from "@/components/auth/connect";
import { RequestBuilder } from "@/components/app/request-builder";
import { currentOwner } from "@/lib/session/server";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Request" };
export const dynamic = "force-dynamic";

/**
 * ASK TO BE PAID.
 *
 * A link and a QR, and nothing else — no invoice object, no pending state, no row in a
 * database waiting to be reconciled. A request is a URL that opens the payer's own pay form
 * with the fields filled in; if they never open it, nothing happened and there is nothing to
 * clean up.
 *
 * That is also why a request cannot be "cancelled": it was never a claim on anybody. The only
 * record this product creates is a receipt, and a receipt only exists once value moved.
 */
export default async function RequestPage() {
  const owner = await currentOwner();

  if (!owner) {
    return (
      <PageFrame
        eyebrow="Request"
        title="Ask to be paid into your book."
        sub="A link and a QR that open the payer's form with your address already in it. Sign in with the wallet that should receive."
      >
        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">Sign in to make a request</span>
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
      eyebrow="Request"
      title="Ask to be paid into your book."
      sub="A request is a link, not an invoice. Nothing is created until value actually moves, and what it creates then is a receipt."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Your request</span>
        </div>
        <div className="wg-panel-body">
          <RequestBuilder owner={owner} origin={siteUrl()} />
        </div>
      </div>
    </PageFrame>
  );
}

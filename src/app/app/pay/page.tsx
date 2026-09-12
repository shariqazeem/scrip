import type { Metadata } from "next";
import { Send } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";

export const metadata: Metadata = { title: "Pay" };

/**
 * FUND AND RELEASE — one form, one confirm, one receipt. No step wizard.
 *
 * A payout carries a payer, recipients, a dollar value, a reason and an optional constraint
 * on the ASSET SET. It never carries weights: the recipient's own policy decides what the
 * value becomes. Built at build-order step 3.
 */
export default function PayPage() {
  return (
    <PageFrame
      eyebrow="Pay"
      title="Release value. It lands as ownership."
      sub="A payout is denominated in dollars and settles into each recipient's own mix. You may restrict the asset set — never the weights. A named gift stays named."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">New payout</span>
        </div>
        <EmptyState
          icon={<Send size={22} strokeWidth={1.6} />}
          title="The pay rail is not wired yet"
          note="Escrow, release and the on-chain receipt land together, because a payout without an openable receipt is a transfer and this product does not ship those."
        />
      </div>
    </PageFrame>
  );
}

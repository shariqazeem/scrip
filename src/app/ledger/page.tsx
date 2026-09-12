import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";

export const metadata: Metadata = { title: "Ledger" };

/**
 * THE PUBLIC RECORD — aggregates and an event stream, never a browsable per-person balance.
 *
 * Every receipt is public because it is anchored to a transaction that is already public. An
 * individual book page is opt-in. Chain data is public; a product should not build the surface
 * that makes someone's net worth searchable by name. Built at build-order step 8.
 */
export default function LedgerPage() {
  return (
    <PageFrame
      eyebrow="Public record"
      title="Everything that has settled."
      sub="Totals, books opened, value released, receipts published. Aggregates and an event stream — never a browsable balance with someone's name on it."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Settled events</span>
        </div>
        <EmptyState
          icon={<ScrollText size={22} strokeWidth={1.6} />}
          title="Nothing has settled yet"
          note="This stream is fed by real receipts and nothing else. The first payout, gift or sponsorship to settle on chain appears here with a link anyone can open."
        />
      </div>
    </PageFrame>
  );
}

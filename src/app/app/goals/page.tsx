import type { Metadata } from "next";
import { Target } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";

export const metadata: Metadata = { title: "Goals" };

/**
 * GOAL VAULTS — a named goal that skims a share of every inbound payout.
 *
 * A goal can spend in exactly two directions: back into the owner's book, or out to the
 * owner. It has no discretion of any kind. Saving at the moment income arrives is the only
 * version of saving that has ever worked at scale. Built at build-order step 7.
 */
export default function GoalsPage() {
  return (
    <PageFrame
      eyebrow="Goals"
      title="Save at the moment value arrives."
      sub="A goal skims a share of every inbound payout toward something named — a laptop, three months of runway. It can only ever pay back into your book or out to you."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Your goals</span>
        </div>
        <EmptyState
          icon={<Target size={22} strokeWidth={1.6} />}
          title="No goals yet"
          note="A goal needs a book to skim from. Open one first, and the skim applies to every arrival after that — never retroactively, because a receipt that already settled cannot be re-cut."
        />
      </div>
    </PageFrame>
  );
}

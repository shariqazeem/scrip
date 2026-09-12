import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet } from "@/components/auth/connect";
import { GoalForm } from "@/components/app/goal-form";
import { readGoals } from "@/lib/book/read-goals";
import { currentOwner } from "@/lib/session/server";

export const metadata: Metadata = { title: "Goals" };
export const dynamic = "force-dynamic";

/**
 * GOAL VAULTS — saving at the moment value arrives, which is the only version of saving that
 * has ever worked at scale.
 *
 * A goal is a program account that takes a chosen share of every inbound payout toward
 * something named. It can spend in exactly two directions in the spec — back into the owner's
 * book, or out to the owner — and in this product those are the same address, because the
 * book IS the owner's wallet. So there is one destination, and the program has no branch that
 * could send anywhere else.
 */
export default async function GoalsPage() {
  const owner = await currentOwner();

  if (!owner) {
    return (
      <PageFrame
        eyebrow="Goals"
        title="Save at the moment value arrives."
        sub="A goal takes a share of every inbound payout toward something named. Sign in with the wallet that receives."
      >
        <div className="wg-panel">
          <div className="wg-panel-head">
            <span className="wg-panel-title">Sign in to set a goal</span>
          </div>
          <div className="wg-panel-body">
            <ConnectWallet />
          </div>
        </div>
      </PageFrame>
    );
  }

  const goals = await readGoals(owner);

  return (
    <PageFrame
      eyebrow="Goals"
      title="Save at the moment value arrives."
      sub="A goal skims a share of every inbound payout toward something named — a laptop, three months of runway. It applies to arrivals from here on, never to ones that already settled, because a receipt that settled cannot be re-cut."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Your goals</span>
        </div>
        <div className="wg-panel-body">
          {!goals.ok ? (
            <p className="wg-held">
              <TriangleAlert size={16} strokeWidth={2} aria-hidden />
              <span>{goals.why}</span>
            </p>
          ) : (
            <GoalForm owner={owner} goals={goals.value} />
          )}
        </div>
      </div>
    </PageFrame>
  );
}

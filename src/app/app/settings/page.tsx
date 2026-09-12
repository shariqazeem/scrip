import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";

export const metadata: Metadata = { title: "Settings" };

/**
 * THE MIX POLICY AND THE DISCLOSURES.
 *
 * The policy is signed once by the owner and enforced by the program. No model, no operator
 * and no program decides how much of anything anyone holds: weights come from a policy the
 * owner signed, prices come from Pyth, routing comes from Jupiter. Built at build-order step 2.
 */
export default function SettingsPage() {
  return (
    <PageFrame
      eyebrow="Settings"
      title="Your mix, signed by you."
      sub="Target weights must sum to 100%. The program enforces what you signed and has no discretion to do anything else."
    >
      <div className="wg-panel">
        <div className="wg-panel-head">
          <span className="wg-panel-title">Mix policy</span>
        </div>
        <EmptyState
          icon={<Settings size={22} strokeWidth={1.6} />}
          title="No policy is signed here yet"
          note="The default is 50% gold, 20% silver, 30% the market — but a default is not a policy until you have signed it, so nothing is shown as yours until you do."
        />
      </div>
    </PageFrame>
  );
}

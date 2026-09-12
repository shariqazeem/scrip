import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { EmptyState, PageFrame } from "@/components/app/page-frame";
import { DEFAULT_POLICY_BPS, assetBySymbol } from "@/lib/assets/registry";
import { bps } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

/**
 * THE MIX POLICY AND THE DISCLOSURES.
 *
 * The policy is signed once by the owner and enforced by the program. No model, no operator
 * and no program decides how much of anything anyone holds: weights come from a policy the
 * owner signed, prices come from Pyth, routing comes from Jupiter. Built at build-order step 2.
 */
export default function SettingsPage() {
  // Read from the registry rather than written into the sentence. A weight stated in prose
  // beside a weight stated in code is two lists that drift, and the one a person reads is the
  // one that would be wrong.
  const defaultMix = DEFAULT_POLICY_BPS.map(
    (l) => `${bps(l.bps)} ${assetBySymbol(l.symbol)?.name ?? l.symbol}`,
  ).join(" and ");

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
          note={`The default is ${defaultMix} — but a default is not a policy until you have signed it, so nothing is shown as yours until you do.`}
        />
      </div>
    </PageFrame>
  );
}

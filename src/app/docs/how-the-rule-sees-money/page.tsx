import type { Metadata } from "next";
import { DocFrame } from "@/components/docs/doc-frame";

export const metadata: Metadata = { title: "How the rule sees money" };

export default function Page() {
  return (
    <DocFrame
      here="/docs/how-the-rule-sees-money"
      eyebrow="Docs"
      title="How the rule sees money."
      lede="Net, not gross. The only thing verifiable on chain without trusting a keeper is the balance of your USDC account, so that is what the rule reads."
    >
      <h2>The watermark</h2>
      <p>
        When you turn the rule on, your current USDC balance becomes the <strong>watermark</strong>: everything already there has been seen.
        A sweep reads the balance now, subtracts the watermark, and calls the difference the inflow. After the slice leaves, the watermark
        becomes the new balance — the remainder is yours, untaxed, forever.
      </p>
      <pre>{`bal      = your USDC balance now
inbound  = bal − watermark            (0 if bal fell below it)
taxable  = min(inbound, cap)          (cap = 0 means no cap)
slice    = taxable × rate
slice    = min(slice, bal − floor)    (floor = 0 means no floor)
require inbound ≥ $1 and slice ≥ $0.50
watermark = bal − slice`}</pre>

      <h2>Spending is not income</h2>
      <p>
        If your balance falls below the watermark, the watermark follows it down. Anyone may call <span className="mono">sync_watermark</span>{" "}
        for that; it can only ever set the watermark to your true balance, and only downward. Without it, an owner who spent $700 would see
        nothing convert until the balance had climbed back past the old mark.
      </p>
      <p>
        If $500 arrives and $500 leaves before a keeper acts, nothing converts. Keepers act within seconds of a balance change, so this is
        rare, and the interface says so rather than pretending otherwise.
      </p>

      <h2>Swap proceeds count</h2>
      <p>
        Sell a token for USDC and the slice converts: every time you take profits, part of it leaves the casino. The cap keeps a large
        treasury move from being taxed in full; the floor keeps cash from dropping below what you need.
      </p>

      <h2>Escalation</h2>
      <p>
        Optionally, one percentage point every ninety days, capped at half. The clock starts when the rule is turned on, and restarts when
        the rate or the escalation is changed.
      </p>

      <h2>What the keeper never decides</h2>
      <p>
        The amount is computed by the program from on-chain state in <span className="mono">begin_sweep</span>. The keeper passes a release
        id and the accounts. It cannot choose more, less, or a different account.
      </p>
    </DocFrame>
  );
}

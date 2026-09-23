"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { sol, usd, usdc } from "@/lib/format";
import { signRuleAction } from "./sign-rule";

/**
 * SETTINGS — the allowance the delegate may still move, the float that pays for receipts,
 * and nothing that changes the rate (that is the rule page). Each action is one signature.
 */
export function SettingsForm({ owner, delegatedAmount, floatLamports, sweepsCovered, ruleOn }: { owner: string; delegatedAmount: string; floatLamports: string; sweepsCovered: number; ruleOn: boolean }) {
  const router = useRouter();
  const [allowance, setAllowance] = useState("1000");
  const [floatSol, setFloatSol] = useState("0.05");
  const [withdrawSol, setWithdrawSol] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function run(label: string, body: Record<string, unknown>, message: string) {
    setBusy(label);
    setWhy(null);
    setDone(null);
    const out = await signRuleAction(owner, body);
    setBusy(null);
    if (!out.ok) {
      if (out.why) setWhy(out.why);
      return;
    }
    setDone(message);
    router.refresh();
  }

  return (
    <div className="sp-org-form">
      <div className="sp-q-row">
        <span className="k">Allowance</span>
        <span className="v">
          <span className="sp-input-wrap">
            <span className="sp-input-prefix">$</span>
            <input className="sp-input is-mono" inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value.replace(/[^0-9.]/g, ""))} />
          </span>
          <button type="button" className="sp-action" disabled={busy !== null || !ruleOn} onClick={() => void run("allowance", { action: "allowance", allowanceUsdc: String(Math.round(Number(allowance || 0) * 1e6)) }, `Re-approved ${usd(Number(allowance || 0))}.`)}>
            {busy === "allowance" ? "Waiting…" : "Re-approve"}
          </button>
        </span>
        <span className="note">
          {usdc(BigInt(delegatedAmount))} left. The most your own register may move in total before you approve again; only through a sweep the program verifies, only into your own account. Revoking it is a token-program instruction Scrip cannot stop.
        </span>
      </div>
      <div className="sp-q-row">
        <span className="k">Float</span>
        <span className="v">
          <span className="sp-input-wrap">
            <span className="sp-input-prefix">◎</span>
            <input className="sp-input is-mono" inputMode="decimal" value={floatSol} onChange={(e) => setFloatSol(e.target.value.replace(/[^0-9.]/g, ""))} />
          </span>
          <button type="button" className="sp-action" disabled={busy !== null} onClick={() => void run("float", { action: "float", lamports: String(Math.round(Number(floatSol || 0) * 1e9)) }, `Added ${sol(BigInt(Math.round(Number(floatSol || 0) * 1e9)))}.`)}>
            {busy === "float" ? "Waiting…" : "Add"}
          </button>
        </span>
        <span className="note">
          {sol(BigInt(floatLamports))} on your Book, about {sweepsCovered} sweeps. Pays each receipt&rsquo;s rent and the keeper&rsquo;s tip. Withdrawable any time.
        </span>
      </div>
      <div className="sp-q-row">
        <span className="k">Withdraw float</span>
        <span className="v">
          <span className="sp-input-wrap">
            <span className="sp-input-prefix">◎</span>
            <input className="sp-input is-mono" inputMode="decimal" placeholder="0.02" value={withdrawSol} onChange={(e) => setWithdrawSol(e.target.value.replace(/[^0-9.]/g, ""))} />
          </span>
          <button type="button" className="sp-action is-quiet" disabled={busy !== null || Number(withdrawSol || 0) <= 0} onClick={() => void run("withdraw", { action: "withdraw", lamports: String(Math.round(Number(withdrawSol || 0) * 1e9)) }, "Withdrawn.")}>
            {busy === "withdraw" ? "Waiting…" : "Withdraw"}
          </button>
        </span>
        <span className="note">Never below the Book&rsquo;s own rent.</span>
      </div>
      {why ? (
        <p className="sp-why is-err">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
      {done ? (
        <p className="sp-why is-ok">
          <Check size={14} strokeWidth={2} aria-hidden /> {done}
        </p>
      ) : null}
    </div>
  );
}

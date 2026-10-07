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
        <span className="k">Limit</span>
        <span className="v">
          <span className="sp-input-wrap">
            <span className="sp-input-prefix">$</span>
            <input className="sp-input is-mono" inputMode="decimal" value={allowance} onChange={(e) => setAllowance(e.target.value.replace(/[^0-9.]/g, ""))} />
          </span>
          <button type="button" className="sp-action" disabled={busy !== null || !ruleOn} onClick={() => void run("allowance", { action: "allowance", allowanceUsdc: String(Math.round(Number(allowance || 0) * 1e6)) }, `Limit set to ${usd(Number(allowance || 0))}.`)}>
            {busy === "allowance" ? "Waiting…" : "Set the limit"}
          </button>
        </span>
        <span className="note">
          {usdc(BigInt(delegatedAmount))} left. The most Scrip can move from this wallet in total before you sign again, only into your chosen stock, only into this same wallet. Stopping is one token-program instruction, and Scrip cannot block it.
        </span>
      </div>
      <div className="sp-q-row">
        <span className="k">Prepaid saves</span>
        <span className="v">
          <span className="sp-input-wrap">
            <span className="sp-input-prefix">◎</span>
            <input className="sp-input is-mono" inputMode="decimal" value={floatSol} onChange={(e) => setFloatSol(e.target.value.replace(/[^0-9.]/g, ""))} />
          </span>
          <button type="button" className="sp-action" disabled={busy !== null} onClick={() => void run("float", { action: "float", lamports: String(Math.round(Number(floatSol || 0) * 1e9)) }, `Added ${sol(BigInt(Math.round(Number(floatSol || 0) * 1e9)))}.`)}>
            {busy === "float" ? "Waiting…" : "Prepay more"}
          </button>
        </span>
        <span className="note">
          {sol(BigInt(floatLamports))} prepaid, about {sweepsCovered} saves. Each automatic save pays its receipt&rsquo;s deposit and a small tip to whoever submits it. Withdraw what is unused any time.
        </span>
      </div>
      <div className="sp-q-row">
        <span className="k">Withdraw prepaid SOL</span>
        <span className="v">
          <span className="sp-input-wrap">
            <span className="sp-input-prefix">◎</span>
            <input className="sp-input is-mono" inputMode="decimal" placeholder="0.02" value={withdrawSol} onChange={(e) => setWithdrawSol(e.target.value.replace(/[^0-9.]/g, ""))} />
          </span>
          <button type="button" className="sp-action is-quiet" disabled={busy !== null || Number(withdrawSol || 0) <= 0} onClick={() => void run("withdraw", { action: "withdraw", lamports: String(Math.round(Number(withdrawSol || 0) * 1e9)) }, "Withdrawn.")}>
            {busy === "withdraw" ? "Waiting…" : "Withdraw"}
          </button>
        </span>
        <span className="note">Never below the deposit your savings record needs to exist.</span>
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

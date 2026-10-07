"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { findAccount, fromBase64, signAndSend } from "@/lib/wallet/client";
import { useTxToast } from "@/components/toast/use-tx-toast";

/**
 * ONE PLAN ACTION, END TO END: ask the server for the transaction, have the wallet that signed
 * in sign and send it, then refresh the page so the chain's new state shows. The toast uses the
 * same words as the button.
 */
export type PlanPhase = "idle" | "building" | "signing" | "done";

export function usePlanAction(owner: string, cluster: string, label: string) {
  const router = useRouter();
  const [phase, setPhase] = useState<PlanPhase>("idle");
  const [why, setWhy] = useState<string | null>(null);
  useTxToast(why ? "failed" : phase, label, { detail: why ?? undefined });

  async function run(payload: Record<string, unknown>): Promise<boolean> {
    const found = findAccount(owner);
    if (!found) {
      setWhy("The wallet that signed in is not connected in this browser. Sign in again.");
      return false;
    }
    setWhy(null);
    setPhase("building");
    let j: { transactionBase64?: string; error?: string };
    try {
      const res = await fetch("/api/plan/tx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      j = (await res.json()) as typeof j;
      if (!res.ok || !j.transactionBase64) {
        setPhase("idle");
        setWhy(j.error ?? "Could not build that.");
        return false;
      }
    } catch {
      setPhase("idle");
      setWhy("Scrip could not be reached. Nothing was signed.");
      return false;
    }
    setPhase("signing");
    const sig = await signAndSend(found.wallet, found.account, fromBase64(j.transactionBase64), cluster);
    if (!sig.ok) {
      setPhase("idle");
      if (sig.why) setWhy(sig.why);
      return false;
    }
    setPhase("done");
    setTimeout(() => {
      setPhase("idle");
      router.refresh();
    }, 2_500);
    return true;
  }

  return { phase, why, run, busy: phase !== "idle" };
}

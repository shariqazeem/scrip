"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, TriangleAlert } from "lucide-react";
import { useSession } from "@/lib/session/use-session";
import { signRuleAction } from "./sign-rule";

/**
 * PAUSE IS A REVOKE. The button sends one token-program instruction; Scrip is not in it and
 * cannot stop you. Resume approves the Book again and resets the watermark.
 */
export function PauseResume({ state }: { state: string }) {
  const router = useRouter();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const paused = state === "paused" || state === "delegate-replaced" || state === "allowance-exhausted";

  async function go() {
    if (!session.owner) return;
    setBusy(true);
    setWhy(null);
    const r = await signRuleAction(session.owner, paused ? { action: "resume", allowanceUsdc: "1000000000" } : { action: "pause" });
    setBusy(false);
    if (!r.ok) {
      if (r.why) setWhy(r.why);
      return;
    }
    setDone(paused ? "Resumed. The watermark is today’s balance." : "Paused with a revoke. Nothing can be swept until you resume.");
    router.refresh();
  }

  return (
    <>
      <button type="button" className="sp-action" disabled={busy || session.loading} onClick={() => void go()}>
        {busy ? "Waiting for your wallet…" : paused ? "Resume" : "Pause"}
      </button>
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
    </>
  );
}

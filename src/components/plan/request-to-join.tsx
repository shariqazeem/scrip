"use client";

import { useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import type { OpenPlan } from "@/lib/plan/open";
import "./plan.css";

const day = (unix: number) => new Date(unix * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);

/**
 * ASK TO JOIN — Scrip's own Plan, offered to a saver who is in no Plan. One tap records the
 * request against the signed-in wallet; the sponsor invites by hand, and joining is then the
 * saver's own signature on their savings page. Nothing moves here, and the copy says so.
 */
export function RequestToJoin({ plan, askedAt = null, compact = false }: { plan: OpenPlan; askedAt?: number | null; compact?: boolean }) {
  const [at, setAt] = useState<number | null>(askedAt);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setWhy(null);
    try {
      const res = await fetch("/api/plan/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: plan.pda }) });
      const j = (await res.json().catch(() => ({}))) as { askedAt?: number; error?: string };
      if (res.ok && j.askedAt) setAt(j.askedAt);
      else setWhy(j.error ?? "That did not go through. Try again in a moment.");
    } catch {
      setWhy("Scrip could not be reached. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`sp-planm is-invite sp-planask${compact ? " is-compact" : ""}`} aria-label="Ask to join Scrip's Plan">
      <p className="sp-planm-k">{plan.sponsorName.startsWith("@") ? `${plan.sponsorName} matches the first savers` : "Scrip matches its first savers"}</p>
      <p className="sp-planm-p">
        {plan.sponsorName} adds {plan.matchBps / 100}% of every automatic save you make, in {plan.stockName}, up to {money(plan.capUsd)} a month,
        from a Plan the program enforces. A person reads every request and invites by hand; once you are invited, joining is one signature on your
        savings page.
      </p>
      {at ? (
        <p className="sp-planask-done" role="status">
          <Check size={16} strokeWidth={2} aria-hidden /> Asked on {day(at)}. Your invitation will appear on your savings page.
        </p>
      ) : (
        <div className="sp-plan-join-act">
          <button type="button" className="sp-action is-primary" disabled={busy} onClick={() => void ask()}>
            {busy ? "Asking…" : "Ask to join"}
          </button>
        </div>
      )}
      {why ? (
        <p className="sp-why">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { INVITES_PER_TX } from "@/lib/plan/requests";
import { usePlanAction } from "./use-plan-action";

/** INVITE — names or addresses, up to ten a signature. Each person joins with their own. */
export function InviteToPlan({ owner, cluster, plan }: { owner: string; cluster: string; plan: string }) {
  const [to, setTo] = useState("");
  const action = usePlanAction(owner, cluster, "Invite");
  return (
    <form
      className="sp-plan-invite"
      onSubmit={(e) => {
        e.preventDefault();
        if (to.trim()) void action.run({ action: "invite", plan, to }).then((done) => done && setTo(""));
      }}
    >
      <label className="sp-label" htmlFor={`inv-${plan}`}>
        Invite people
      </label>
      <div className="sp-plan-invite-row">
        <input id={`inv-${plan}`} className="sp-input" placeholder="@ayesha, or wallet addresses, up to ten" value={to} onChange={(e) => setTo(e.target.value)} />
        <button type="submit" className="sp-action is-primary" disabled={!to.trim() || action.busy}>
          {action.phase === "signing" ? "Waiting for your wallet…" : action.phase === "done" ? "Invited" : "Invite"}
        </button>
      </div>
      {action.why ? (
        <p className="sp-why">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {action.why}
        </p>
      ) : (
        <p className="sp-hint">Nothing is matched until they join, with their own signature, and only saves made after that.</p>
      )}
    </form>
  );
}

/** TOP UP — USDC routed into the escrow in one signature; it can only leave as a match, or back at close. */
export function TopUpPlan({ owner, cluster, plan, stockName }: { owner: string; cluster: string; plan: string; stockName: string }) {
  const [usd, setUsd] = useState("25");
  const action = usePlanAction(owner, cluster, "Top up");
  const amount = Number(usd);
  const valid = Number.isFinite(amount) && amount >= 1;
  return (
    <form
      className="sp-plan-invite"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void action.run({ action: "topup", plan, budgetUsd: amount });
      }}
    >
      <label className="sp-label" htmlFor={`top-${plan}`}>
        Add to the escrow
      </label>
      <div className="sp-plan-invite-row">
        <input id={`top-${plan}`} className="sp-input mono" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value.replace(/[^0-9.]/g, ""))} aria-describedby={`top-${plan}-hint`} />
        <button type="submit" className="sp-action is-primary" disabled={!valid || action.busy}>
          {action.phase === "signing" ? "Waiting for your wallet…" : action.phase === "done" ? "Added" : `Add $${valid ? amount : 0} in ${stockName}`}
        </button>
      </div>
      {action.why ? (
        <p className="sp-why">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {action.why}
        </p>
      ) : (
        <p className="sp-hint" id={`top-${plan}-hint`}>
          Your USDC becomes {stockName} in the escrow, in one signature. It can only leave as a match to a member, or back to you when the Plan closes.
        </p>
      )}
    </form>
  );
}

/** INVITE WHO ASKED — the oldest requests, as many as one signature carries. */
export function InviteRequests({ owner, cluster, plan, addresses }: { owner: string; cluster: string; plan: string; addresses: readonly string[] }) {
  const action = usePlanAction(owner, cluster, "Invite");
  const batch = addresses.slice(0, INVITES_PER_TX);
  const label = batch.length === addresses.length ? (batch.length === 1 ? "Invite them" : `Invite all ${batch.length}`) : `Invite the first ${batch.length}`;
  return (
    <div className="sp-plan-join-act">
      <button type="button" className="sp-action is-primary" disabled={action.busy || batch.length === 0} onClick={() => void action.run({ action: "invite", plan, to: batch.join(" ") })}>
        {action.phase === "signing" ? "Waiting for your wallet…" : action.phase === "done" ? "Invited" : label}
      </button>
      {action.why ? (
        <p className="sp-why">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {action.why}
        </p>
      ) : null}
    </div>
  );
}

/** REMOVE — the person keeps every match already paid; future saves are no longer matched. */
export function RemoveFromPlan({ owner, cluster, plan, member }: { owner: string; cluster: string; plan: string; member: string }) {
  const action = usePlanAction(owner, cluster, "Remove");
  return (
    <button type="button" className="sp-action is-quiet" disabled={action.busy} onClick={() => void action.run({ action: "remove", plan, owner: member })} title={action.why ?? "Matches already paid stay theirs."}>
      {action.phase === "signing" ? "Waiting…" : action.why ? "Retry" : "Remove"}
    </button>
  );
}

/** CLOSE — only with nobody left in it; what is unspent in the escrow comes back. */
export function ClosePlan({ owner, cluster, plan, members }: { owner: string; cluster: string; plan: string; members: number }) {
  const action = usePlanAction(owner, cluster, "Close the Plan");
  return (
    <div className="sp-plan-close">
      <button type="button" className="sp-action" disabled={members > 0 || action.busy} onClick={() => void action.run({ action: "close", plan })}>
        {action.phase === "signing" ? "Waiting for your wallet…" : "Close the Plan"}
      </button>
      <p className="sp-hint">{action.why ?? (members > 0 ? "Remove everyone first; a Plan closes only when nobody is left in it." : "What is unspent in the escrow comes back to this wallet.")}</p>
    </div>
  );
}

/** JOIN — the member's own signature. Nothing moves; from now on, their automatic saves are matched. */
export function JoinPlan({ owner, cluster, plan }: { owner: string; cluster: string; plan: string }) {
  const action = usePlanAction(owner, cluster, "Join the Plan");
  return (
    <div className="sp-plan-join-act">
      <button type="button" className="sp-action is-primary" disabled={action.busy} onClick={() => void action.run({ action: "accept", plan })}>
        {action.phase === "signing" ? "Waiting for your wallet…" : action.phase === "done" ? "Joined" : "Join the Plan"}
      </button>
      {action.why ? (
        <p className="sp-why">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {action.why}
        </p>
      ) : null}
    </div>
  );
}

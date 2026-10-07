"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { usd } from "@/lib/format";
import { MAX_REASON_LEN } from "@/lib/intake/memo";
import { usePlanAction } from "./use-plan-action";

/**
 * START A PLAN — a match the program enforces. A name, the stock it pays in, how much of each
 * automatic save it adds, the most per person a month, and what goes in now. One signature
 * opens the Plan and buys the first escrow through Jupiter in the same transaction.
 */
export type PlanAssetOpt = { mint: string; name: string; symbol: string; waits: string | null };

const MATCHES = [2500, 5000, 10000] as const;

export function PlanForm({ owner, cluster, assets, defaultMint }: { owner: string; cluster: string; assets: PlanAssetOpt[]; defaultMint: string }) {
  const [name, setName] = useState("");
  const [assetMint, setAssetMint] = useState(defaultMint);
  const [matchBps, setMatchBps] = useState<number>(5000);
  const [cap, setCap] = useState("20");
  const [budget, setBudget] = useState("20");
  const action = usePlanAction(owner, cluster, "Open the Plan");
  const asset = assets.find((a) => a.mint === assetMint) ?? assets[0]!;
  const capUsd = Number(cap);
  const budgetUsd = Number(budget);
  const valid = name.trim().length >= 3 && Number.isFinite(capUsd) && capUsd > 0 && Number.isFinite(budgetUsd) && budgetUsd >= 1;
  const cents = Math.round(matchBps / 100);

  return (
    <form
      className="sp-plan-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void action.run({ action: "open", name: name.trim(), assetMint, matchBps, capUsd, budgetUsd });
      }}
    >
      <div className="sp-field">
        <label className="sp-label" htmlFor="pname">
          Name
        </label>
        <input id="pname" className="sp-input" placeholder="Acme savings match" value={name} maxLength={MAX_REASON_LEN} onChange={(e) => setName(e.target.value)} />
        <p className="sp-hint">On the Plan&rsquo;s own transaction, and what the people you invite see.</p>
      </div>
      <div className="sp-field">
        <span className="sp-label">Paid in</span>
        <div className="sp-choices">
          {assets.map((a) => (
            <button key={a.mint} type="button" className={`sp-choice${assetMint === a.mint ? " on" : ""}`} onClick={() => setAssetMint(a.mint)} title={`${a.name} (${a.symbol})`}>
              {a.name}
            </button>
          ))}
        </div>
        {asset.waits ? (
          <p className="sp-hint is-wait">Matches in {asset.name} wait for a price Scrip can verify on Solana; the newest one there is {asset.waits} old.</p>
        ) : (
          <p className="sp-hint">The match lands in each person&rsquo;s own wallet, in {asset.name}, right after their save.</p>
        )}
      </div>
      <div className="sp-field">
        <span className="sp-label">Match</span>
        <div className="sp-choices">
          {MATCHES.map((m) => (
            <button key={m} type="button" className={`sp-choice${matchBps === m ? " on" : ""}`} onClick={() => setMatchBps(m)}>
              {m / 100}%
            </button>
          ))}
        </div>
        <p className="sp-hint">
          {cents} cents in stock for every dollar a person saves automatically. Saves made before they join are never matched.
        </p>
      </div>
      <div className="sp-plan-two">
        <div className="sp-field">
          <label className="sp-label" htmlFor="pcap">
            Most per person, each month
          </label>
          <div className="sp-input-wrap">
            <span className="sp-input-prefix">$</span>
            <input id="pcap" className="sp-input is-mono" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^0-9.]/g, ""))} />
          </div>
        </div>
        <div className="sp-field">
          <label className="sp-label" htmlFor="pbudget">
            Put in now
          </label>
          <div className="sp-input-wrap">
            <span className="sp-input-prefix">$</span>
            <input id="pbudget" className="sp-input is-mono" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^0-9.]/g, ""))} />
          </div>
        </div>
      </div>
      <p className="sp-plan-trust">
        {Number.isFinite(budgetUsd) && budgetUsd > 0 ? `${usd(budgetUsd)} of your USDC becomes ${asset.name} in the Plan's escrow, ` : "Your USDC becomes stock in the Plan's escrow, "}
        which only the program can pay out of, and only as matches. You can end the Plan once nobody is left in it and take back what is unspent; a
        match already paid is never taken back.
      </p>
      {action.why ? (
        <p className="sp-why">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {action.why}
        </p>
      ) : null}
      <div className="sp-actions">
        <button type="submit" className="sp-action is-primary is-big" disabled={!valid || action.busy}>
          {action.phase === "building" ? "Building…" : action.phase === "signing" ? "Waiting for your wallet…" : action.phase === "done" ? "Opened" : "Open the Plan"}
        </button>
      </div>
    </form>
  );
}

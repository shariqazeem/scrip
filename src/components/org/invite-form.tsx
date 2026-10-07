"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Add one wallet to the Welcome-bonus invites. The list is the whole guard against farming. */
export function InviteForm() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="sp-org-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setWhy(null);
        const res = await fetch("/api/bonus/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, label }) }).catch(() => null);
        const j = res ? ((await res.json()) as { error?: string }) : { error: "Could not reach Scrip." };
        setBusy(false);
        if (!res?.ok) {
          setWhy(j.error ?? "Could not add that wallet.");
          return;
        }
        setAddress("");
        setLabel("");
        router.refresh();
      }}
    >
      <label className="sp-q-row">
        <span className="k">Wallet</span>
        <span className="v">
          <input className="sp-input is-mono" value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="their Solana address" aria-label="Wallet address" />
        </span>
      </label>
      <label className="sp-q-row">
        <span className="k">Who</span>
        <span className="v">
          <input className="sp-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="a note for you, never shown publicly" aria-label="Note" />
        </span>
      </label>
      <button type="submit" className="sp-action is-primary" disabled={busy || address.length < 32}>
        {busy ? "Adding…" : "Invite this wallet"}
      </button>
      {why ? <p className="sp-why is-err">{why}</p> : null}
    </form>
  );
}

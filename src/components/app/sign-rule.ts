"use client";

import { type Outcome, held, ok } from "@/lib/outcome";
import { findAccount, fromBase64, signAndSend } from "@/lib/wallet/client";

/**
 * ASK THE SERVER FOR A RULE TRANSACTION, THEN SIGN IT IN THE OWNER'S WALLET.
 *
 * The server composes (approve BEFORE enable, revoke BEFORE disable) and supplies the
 * blockhash; it cannot sign. The wallet that opened the session must be connected in this
 * browser, holding the only key involved.
 */
export async function signRuleAction(owner: string, body: Record<string, unknown>): Promise<Outcome<string>> {
  const prep = await fetch("/api/chain/prepare", { cache: "no-store" });
  if (!prep.ok) return held("Could not reach the chain.");
  const chain = (await prep.json()) as { cluster: string; clusterLabel: string; programDeployed: boolean };
  if (!chain.programDeployed) {
    return held(`The Scrip program is not deployed on ${chain.clusterLabel} yet. Nothing was sent and nothing was charged.`);
  }
  const res = await fetch("/api/rule/tx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json()) as { transactionBase64?: string; error?: string };
  if (!res.ok || !j.transactionBase64) return held(j.error ?? "The transaction could not be built.");
  const found = findAccount(owner);
  if (!found) return held("The wallet that opened this book is not connected in this browser.");
  const sig = await signAndSend(found.wallet, found.account, fromBase64(j.transactionBase64), chain.cluster);
  if (!sig.ok) return sig;
  return ok(sig.value);
}

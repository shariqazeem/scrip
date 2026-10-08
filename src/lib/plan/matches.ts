import "server-only";

import { PublicKey } from "@solana/web3.js";
import { connection } from "@/lib/solana/connection";
import { readTxViews } from "@/lib/solana/tx-view";
import { type Matched, matchedFromLogs } from "./matched";
import { handlesOf } from "./read";

export type MatchLine = Matched & {
  /** The match's own transaction: it is not the receipt's, which only the save wrote. */
  readonly signature: string;
  /** The sponsor's name where they made it public (`handlesOf`), else null. */
  readonly sponsorHandle: string | null;
};

const g = globalThis as typeof globalThis & { __scripMatches?: Map<string, { at: number; lines: MatchLine[] }> };
const cache = (g.__scripMatches ??= new Map<string, { at: number; lines: MatchLine[] }>());
/** A match lands seconds after the save it matches, so "none yet" is asked again soon. */
const NONE_FOR_MS = 15_000;
const FOUND_FOR_MS = 10 * 60_000;

/**
 * THE MATCHES ON A RECEIPT — every `match_receipt` that read this receipt, decoded from the
 * `Matched` event in its own transaction. The receipt account is named by each one, so the
 * receipt's own signature list finds them; the save that wrote it and any measurement are
 * passed over because they carry no such event. Read from the chain on every look, cached
 * briefly; a refused read answers with what was last seen, never with "none".
 */
export async function matchesFor(receipt: string, writer: string): Promise<MatchLine[]> {
  const hit = cache.get(receipt);
  if (hit && Date.now() - hit.at < (hit.lines.length > 0 ? FOUND_FOR_MS : NONE_FOR_MS)) return hit.lines;
  try {
    const conn = connection();
    const sigs = await conn.getSignaturesForAddress(new PublicKey(receipt), { limit: 25 }, "confirmed");
    const others = sigs.filter((s) => !s.err && s.signature !== writer).map((s) => s.signature);
    const views = await readTxViews(conn, others);
    const found = views.flatMap((v) => (v ? matchedFromLogs(v.logs).filter((m) => m.receipt === receipt).map((m) => ({ ...m, signature: v.sig })) : []));
    const handles = await handlesOf([...new Set(found.map((f) => f.sponsor))]).catch(() => new Map<string, string>());
    const lines = found.map((f) => ({ ...f, sponsorHandle: handles.get(f.sponsor) ?? null })).sort((a, b) => a.at - b.at);
    cache.set(receipt, { at: Date.now(), lines });
    return lines;
  } catch {
    return hit?.lines ?? [];
  }
}

import "server-only";

import { desc, eq } from "drizzle-orm";
import { assetByMint } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { receipts, saves } from "@/lib/db/schema";
import { short } from "@/lib/format";
import { matchesFor } from "@/lib/plan/matches";
import { landedToStock } from "@/lib/receipt/figures";
import { startedWith } from "@/lib/start/memo";
import { isStranger, isTeam, walletTag } from "@/lib/team";
import { stockByMint } from "./catalogue";

/**
 * ONE REAL RECEIPT FOR THE FRONT DOOR — chosen by `frontRank` across saves and automatic saves,
 * preferring a wallet outside the team. Read from the cache of the chain, linked to the receipt
 * page that reads the chain itself, with a sponsor's match when it has one. Never a sample: no
 * receipt, no stub.
 *
 * A sweep is chosen for what it shows, honestly: one that became stock within a minute of the
 * money landing before one that did not, and never one that took over ten minutes while a faster
 * one exists. On 8 October the newest sweep read "87 min 49 s", from the morning the saving
 * service was being fixed, and it was the receipt the front door featured.
 */
export function sweepPreference(r: { recipient: string; settledUnix: number; attributedJson: string }): number {
  let arrivals: Array<{ at?: number | null }> = [];
  try {
    arrivals = JSON.parse(r.attributedJson) as Array<{ at?: number | null }>;
  } catch {
    arrivals = [];
  }
  const gap = landedToStock(r.settledUnix, arrivals.map((a) => a.at));
  const outside = !isTeam(r.recipient);
  if (gap !== null && gap <= 60) return outside ? 0 : 1;
  if (gap !== null && gap <= 600) return outside ? 2 : 3;
  return gap === null ? 4 : 5;
}
/**
 * WHICH RECEIPT LEADS, ACROSS BOTH KINDS. Lower is better; among equals, the newest. The front
 * door shows the product, and the product is the automatic save: since 9 October any automatic
 * save that became stock within ten minutes leads, a stranger's before the team's and a fast one
 * before a slower one; a save made by hand (a swap) comes after them, a stranger's first; last
 * whatever took longer or is not attributed. "It feels like just a swap," the founder said of
 * the start that led with one.
 */
export type FrontCandidate =
  | { readonly kind: "save"; readonly owner: string; readonly settledUnix: number }
  | { readonly kind: "sweep"; readonly recipient: string; readonly settledUnix: number; readonly attributedJson: string };

export function frontRank(c: FrontCandidate): number {
  if (c.kind === "save") return (isTeam(c.owner) ? 5 : 4) * 2;
  const byPreference = [0, 1, 2, 3, 6, 7] as const;
  // Within each class, a payment that landed before the rule's first payment counted at the start:
  // "a payment lands" is the picture the front door draws, and the start is a step on the way to it.
  return (byPreference[sweepPreference(c)] ?? 7) * 2 + (startedWith(c.attributedJson) ? 1 : 0);
}

export type FrontReceipt = {
  readonly sig: string;
  readonly kind: "save" | "sweep";
  readonly paidUsdc: bigint;
  /** A sweep's inflow, the "landed" figure; null for a save. */
  readonly basisUsdc: bigint | null;
  readonly rateBps: number | null;
  readonly amountRaw: bigint;
  readonly decimals: number;
  readonly name: string;
  readonly ticker: string;
  readonly settledUnix: number;
  /** "team" or "paid tester" beside the brand; nothing for anybody else. */
  readonly tag: "team" | "paid tester" | undefined;
  /** A sponsor's match on this save, read from its own transaction. */
  readonly match: { readonly by: string; readonly usdc: bigint; readonly amountRaw: bigint } | null;
  /** An automatic save: seconds from the money landing (or saving being turned on) to the stock. */
  readonly seconds: number | null;
  /** The rule's first payment, counted as saving was turned on. */
  readonly atStart: boolean;
};

export async function frontReceipt(): Promise<FrontReceipt | null> {
  const [recentSaves, recentSweeps] = await Promise.all([
    db.select().from(saves).orderBy(desc(saves.settledUnix)).limit(20),
    db.select().from(receipts).where(eq(receipts.kind, "sweep")).orderBy(desc(receipts.settledUnix)).limit(20),
  ]);
  // Gold is on the list and off the pitch: the front door shows a stock when there is one.
  const candidates = [
    ...recentSaves.filter((s) => stockByMint(s.mint)).map((row) => ({ kind: "save" as const, owner: row.owner, settledUnix: row.settledUnix, row })),
    ...recentSweeps
      .filter((r) => assetByMint(r.asset) && assetByMint(r.asset)?.kind !== "metal")
      .map((row) => ({ kind: "sweep" as const, recipient: row.recipient, settledUnix: row.settledUnix, attributedJson: row.attributedJson, row })),
  ].sort((a, b) => b.settledUnix - a.settledUnix);
  // A stable sort keeps the newest first among equals.
  const best = [...candidates].sort((a, b) => frontRank(a) - frontRank(b))[0];
  if (!best) return null;

  if (best.kind === "save") {
    const save = best.row;
    const stock = stockByMint(save.mint)!;
    return {
      sig: save.sig,
      kind: "save",
      paidUsdc: BigInt(save.paidUsdc),
      basisUsdc: null,
      rateBps: null,
      amountRaw: BigInt(save.amountRaw),
      decimals: stock.decimals,
      name: stock.name,
      ticker: stock.ticker,
      settledUnix: save.settledUnix,
      tag: walletTag(save.owner),
      match: null,
      seconds: null,
      atStart: false,
    };
  }
  const sweep = best.row;
  const asset = assetByMint(sweep.asset)!;
  const stock = stockByMint(sweep.asset);
  const m = (await matchesFor(sweep.pda, sweep.sig).catch(() => []))[0] ?? null;
  return {
    sig: sweep.sig,
    kind: "sweep",
    paidUsdc: BigInt(sweep.paidUsdc),
    basisUsdc: BigInt(sweep.basisUsdc),
    rateBps: sweep.rateBps,
    amountRaw: BigInt(sweep.amountRaw),
    decimals: asset.decimals,
    name: stock?.name ?? asset.name,
    ticker: stock?.ticker ?? asset.symbol,
    settledUnix: sweep.settledUnix,
    tag: walletTag(sweep.recipient),
    match: m ? { by: m.sponsorHandle ? `@${m.sponsorHandle}` : short(m.sponsor), usdc: m.usdc, amountRaw: m.amountRaw } : null,
    seconds: landedToStock(sweep.settledUnix, arrivalsOf(sweep.attributedJson)),
    atStart: startedWith(sweep.attributedJson),
  };
}

function arrivalsOf(attributedJson: string): Array<number | null | undefined> {
  try {
    return (JSON.parse(attributedJson) as Array<{ at?: number | null }>).map((a) => a.at);
  } catch {
    return [];
  }
}

/**
 * How many people outside the team have saved: every wallet with a save or a receipt that is
 * neither the team's nor a paid tester's. For the front door, which says it only once it is
 * not zero.
 */
export async function strangersSaving(): Promise<number> {
  const [owners, recipients] = await Promise.all([db.select({ a: saves.owner }).from(saves), db.select({ a: receipts.recipient }).from(receipts)]);
  return new Set([...owners, ...recipients].map((r) => r.a).filter((a) => isStranger(a))).size;
}

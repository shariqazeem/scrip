import "server-only";

import { desc, eq } from "drizzle-orm";
import { assetByMint } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { receipts, saves } from "@/lib/db/schema";
import { landedToStock } from "@/lib/receipt/figures";
import { isStranger, isTeam } from "@/lib/team";
import { stockByMint } from "./catalogue";

/**
 * ONE REAL RECEIPT FOR THE FRONT DOOR — the newest save, or failing that a sweep, preferring a
 * wallet outside the team. Read from the cache of the chain, linked to the receipt page that reads
 * the chain itself. Never a sample: no receipt, no stub.
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
  readonly team: boolean;
};

export async function frontReceipt(): Promise<FrontReceipt | null> {
  const recentSaves = await db.select().from(saves).orderBy(desc(saves.settledUnix)).limit(20);
  const save = recentSaves.find((s) => !isTeam(s.owner)) ?? recentSaves[0];
  if (save) {
    const stock = stockByMint(save.mint);
    if (stock) {
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
        team: isTeam(save.owner),
      };
    }
  }
  // Gold is on the list and off the pitch: the front door shows a stock when there is one.
  const sweeps = (await db.select().from(receipts).where(eq(receipts.kind, "sweep")).orderBy(desc(receipts.settledUnix)).limit(20)).filter(
    (r) => assetByMint(r.asset)?.kind !== "metal",
  );
  // Best preference first; among equals, the newest (the list is already newest first).
  const sweep = [...sweeps].sort((a, b) => sweepPreference(a) - sweepPreference(b))[0];
  if (!sweep) return null;
  const asset = assetByMint(sweep.asset);
  if (!asset) return null;
  const stock = stockByMint(sweep.asset);
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
    team: isTeam(sweep.recipient),
  };
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

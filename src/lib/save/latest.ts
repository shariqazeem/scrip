import "server-only";

import { desc, eq } from "drizzle-orm";
import { assetByMint } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { receipts, saves } from "@/lib/db/schema";
import { isTeam } from "@/lib/team";
import { stockByMint } from "./catalogue";

/**
 * ONE REAL RECEIPT FOR THE FRONT DOOR — the newest save, or failing that the newest sweep,
 * preferring a wallet outside the team. Read from the cache of the chain, linked to the
 * receipt page that reads the chain itself. Never a sample: no receipt, no stub.
 */
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
  const sweep = sweeps.find((r) => !isTeam(r.recipient)) ?? sweeps[0];
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

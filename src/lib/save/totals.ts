import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { receipts, saves } from "@/lib/db/schema";

/**
 * WHAT A WALLET HAS SAVED, AND WHAT WAS ADDED FOR IT — summed from the cache of receipts, which
 * is a cache of the chain: every figure here is the sum of receipts anyone can open.
 *
 * Saved by the person: every save they signed, plus every automatic save (a sweep is their own
 * USDC becoming stock). Added for them: stock somebody else paid in, gifted, or released from a
 * grant. A grant's purchase receipt is the escrow being bought, not a delivery, so it is not
 * counted; its vests are.
 */
export type SavingsTotals = {
  readonly savedUsdc: bigint;
  readonly addedUsdc: bigint;
  readonly saves: number;
  readonly automatic: number;
  readonly added: number;
  /** The first time this wallet saved, by hand or automatically: for "Save once", done. */
  readonly first: { readonly sig: string; readonly paidUsdc: bigint; readonly mint: string; readonly unix: number } | null;
};

const ADDED_KINDS = ["pay", "gift", "vest"] as const;

export async function savingsTotals(owner: string): Promise<SavingsTotals> {
  const [byHand, automatic, added, firstSave, firstSweep] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)`, paid: sql<number>`coalesce(sum(${saves.paidUsdc}), 0)` })
      .from(saves)
      .where(eq(saves.owner, owner)),
    db
      .select({ n: sql<number>`count(*)`, paid: sql<number>`coalesce(sum(${receipts.paidUsdc}), 0)` })
      .from(receipts)
      .where(and(eq(receipts.recipient, owner), eq(receipts.kind, "sweep"))),
    db
      .select({ n: sql<number>`count(*)`, paid: sql<number>`coalesce(sum(${receipts.paidUsdc}), 0)` })
      .from(receipts)
      .where(and(eq(receipts.recipient, owner), inArray(receipts.kind, [...ADDED_KINDS]))),
    db.select({ sig: saves.sig, paid: saves.paidUsdc, mint: saves.mint, unix: saves.settledUnix }).from(saves).where(eq(saves.owner, owner)).orderBy(asc(saves.settledUnix)).limit(1),
    db
      .select({ sig: receipts.sig, paid: receipts.paidUsdc, mint: receipts.asset, unix: receipts.settledUnix })
      .from(receipts)
      .where(and(eq(receipts.recipient, owner), eq(receipts.kind, "sweep")))
      .orderBy(asc(receipts.settledUnix))
      .limit(1),
  ]);
  const candidates = [firstSave[0], firstSweep[0]].filter((x): x is NonNullable<typeof x> => !!x && !!x.sig);
  const first = candidates.sort((a, b) => a.unix - b.unix)[0] ?? null;
  return {
    savedUsdc: BigInt(Math.round(Number(byHand[0]?.paid ?? 0))) + BigInt(Math.round(Number(automatic[0]?.paid ?? 0))),
    addedUsdc: BigInt(Math.round(Number(added[0]?.paid ?? 0))),
    saves: Number(byHand[0]?.n ?? 0),
    automatic: Number(automatic[0]?.n ?? 0),
    added: Number(added[0]?.n ?? 0),
    first: first ? { sig: first.sig!, paidUsdc: BigInt(first.paid), mint: first.mint, unix: first.unix } : null,
  };
}

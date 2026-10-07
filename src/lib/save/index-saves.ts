import "server-only";

import type { Connection } from "@solana/web3.js";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cursors, saves } from "@/lib/db/schema";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { readTxViews } from "@/lib/solana/tx-view";
import { isTeam } from "@/lib/team";
import { SAVE_MARK } from "./mark";
import { parseSave } from "./parse";
import { recordSave, viewSave } from "./read";

/**
 * EVERY SAVE, FROM ONE ADDRESS. Each save carries the mark read-only, so the chain itself
 * lists them: `getSignaturesForAddress(mark)`. The indexer walks that list from its cursor,
 * parses each transaction, and keeps the saves in the cache beside the program's receipts.
 * A transaction that names the mark but is not a save (someone else's, or a failed one) is
 * skipped and never counted.
 *
 * A save first seen within two minutes of landing gets its Pyth stamp here too; a later one
 * is kept without, because a price read now is not the price it filled against.
 */
const CURSOR = "save-mark";

export async function indexSaves(conn: Connection = connection(), pageSize = 100, maxPages = 10): Promise<Outcome<{ scanned: number; added: number; skipped: number }>> {
  const cursor = (await db.select().from(cursors).where(eq(cursors.key, CURSOR)).limit(1))[0];
  const fresh: Array<{ signature: string; slot: number; err: unknown }> = [];
  let before: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    let batch;
    try {
      batch = await conn.getSignaturesForAddress(SAVE_MARK, { before, until: cursor?.signature, limit: pageSize }, "confirmed");
    } catch (err) {
      return held(`Could not list the saves (${err instanceof Error ? err.message : String(err)}).`);
    }
    fresh.push(...batch);
    if (batch.length < pageSize) break;
    before = batch[batch.length - 1]!.signature;
  }

  let added = 0;
  let skipped = 0;
  const ordered = [...fresh].reverse().filter((e) => {
    if (e.err) skipped += 1;
    return !e.err;
  });
  for (let i = 0; i < ordered.length; i += 25) {
    const chunk = ordered.slice(i, i + 25);
    const views = await readTxViews(
      conn,
      chunk.map((c) => c.signature),
    ).catch(() => null);
    if (!views) return held("Could not read the saves' transactions; the cursor stays where it was.");
    for (const v of views) {
      const save = v ? parseSave(v) : null;
      if (!save) {
        skipped += 1;
        continue;
      }
      const known = (await db.select({ sig: saves.sig }).from(saves).where(eq(saves.sig, save.sig)).limit(1))[0];
      if (known) continue;
      // Near enough to now for a stamp: read it with the view; otherwise keep the save as it is.
      if (Math.floor(Date.now() / 1000) - save.blockTime <= 120) await viewSave(save);
      else await recordSave(save, null);
      added += 1;
    }
  }

  const newest = fresh[0];
  if (newest) {
    await db
      .insert(cursors)
      .values({ key: CURSOR, signature: newest.signature, slot: newest.slot, updatedAt: Math.floor(Date.now() / 1000) })
      .onConflictDoUpdate({ target: cursors.key, set: { signature: newest.signature, slot: newest.slot, updatedAt: Math.floor(Date.now() / 1000) } });
  }
  return ok({ scanned: fresh.length, added, skipped });
}

/** The saves, counted the way the ledger counts receipts: in all, and outside the team. */
export async function saveTotals() {
  const rows = await db.select({ owner: saves.owner, paid: saves.paidUsdc }).from(saves);
  const outside = rows.filter((r) => !isTeam(r.owner));
  return {
    saves: rows.length,
    savers: new Set(rows.map((r) => r.owner)).size,
    paidUsdc: BigInt(rows.reduce((n, r) => n + r.paid, 0)),
    outsideSaves: outside.length,
    outsideSavers: new Set(outside.map((r) => r.owner)).size,
  };
}

export async function recentSaves(limit = 25) {
  return db.select().from(saves).orderBy(desc(saves.settledUnix)).limit(limit);
}

export async function savesFor(owner: string, limit = 50) {
  return db.select().from(saves).where(eq(saves.owner, owner)).orderBy(desc(saves.settledUnix)).limit(limit);
}

/** Every save's paid USDC, summed, for a single number on a strip. */
export async function savedUsdc(): Promise<bigint> {
  const [r] = await db.select({ paid: sql<number>`coalesce(sum(${saves.paidUsdc}), 0)` }).from(saves);
  return BigInt(Math.round(Number(r?.paid ?? 0)));
}

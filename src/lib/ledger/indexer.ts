import "server-only";

import { type Connection, PublicKey } from "@solana/web3.js";
import { and, asc, desc, eq, gt, ne, sql } from "drizzle-orm";
import { readReceiptAccount, receiptFromTransaction, receiptInTransaction, writerOf } from "@/lib/book/read-receipt";
import { decodeBook, decodeGrant, decodeHandle } from "@/lib/book/decode";
import { db } from "@/lib/db";
import { newId } from "@/lib/db/keys";
import { books, cursors, grants, receipts } from "@/lib/db/schema";
import { toSafeNumber } from "@/lib/money";
import { notifyReceipt } from "@/lib/notify/telegram";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID, discriminatorFilter } from "@/lib/solana/program";
import { attributeSweep } from "./attribute";
import { rentFor } from "@/lib/solana/rent";
import { transactionsFor } from "@/lib/solana/batch";

/**
 * THE INDEXER — mirrors on-chain receipts and books into the cache so the ledger is fast.
 *
 * THE DATABASE IS A CACHE. THE CHAIN IS THE MEMORY. `/receipt/[sig]` never reads this table;
 * the page a stranger opens must not depend on our having indexed anything.
 *
 * INCREMENTAL, AND PROVEN SO. The cursor is the newest signature fully processed. A run lists
 * everything newer than it, walking pages with `before` until the page is short, then reads
 * the OLDEST FIRST, at most its budget, and moves the cursor behind exactly what it finished.
 * Listing is cheap and reading is not, so a small run (the register's four-second poll reads
 * 25) still never passes anything over: until 8 October it listed one page, read it, and
 * moved the cursor to its newest signature, so in a busy minute everything older than that
 * page was skipped for good. `indexer.test.ts` holds both halves.
 */

const CURSOR_KEY = `receipts:${SCRIP_PROGRAM_ID.toBase58()}`;

export type IndexReport = {
  readonly scanned: number;
  readonly added: number;
  readonly updated: number;
  readonly skipped: number;
  readonly holds: readonly string[];
};

export type SignatureSource = (opts: { before?: string; until?: string; limit: number }) => Promise<
  Array<{ signature: string; slot: number; err: unknown; blockTime?: number | null }>
>;

export async function indexReceipts(
  conn: Connection = connection(),
  pageSize = 50,
  maxPages = 20,
): Promise<Outcome<IndexReport>> {
  const source: SignatureSource = (opts) => conn.getSignaturesForAddress(SCRIP_PROGRAM_ID, opts, "confirmed");
  return indexReceiptsFrom(conn, source, pageSize * maxPages);
}

type Listed = { signature: string; slot: number; err: unknown; blockTime?: number | null };

/**
 * How long a transaction that cannot be read may hold the cursor. A refused or timed-out read
 * passes within minutes; one that has failed for half an hour will not, and it must never stop
 * every receipt after it from reaching the cache. It is reported, and the cursor moves on.
 */
const GIVE_UP_AFTER_SECONDS = 1800;

/**
 * Every signature newer than the cursor, newest first, listed to the end. Stopping early would
 * leave a gap between the cursor and the oldest signature listed, and whatever sat in the gap
 * would never be read; so a listing that cannot reach the cursor holds instead.
 */
export async function signaturesSince(source: SignatureSource, cursor: string | undefined, pageSize = 1000, maxPages = 100): Promise<Outcome<Listed[]>> {
  const out: Listed[] = [];
  let before: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    let batch;
    try {
      batch = await source({ before, until: cursor, limit: pageSize });
    } catch (err) {
      return held(`Could not list the program's transactions (${err instanceof Error ? err.message : String(err)}).`);
    }
    out.push(...batch);
    if (batch.length < pageSize) return ok(out);
    before = batch[batch.length - 1]!.signature;
  }
  return held(`More than ${pageSize * maxPages} transactions since the last index; nothing was read, so nothing is skipped.`);
}

/** Where the cursor may move after a run: the newest entry with nothing unfinished at or before it. */
export function cursorAfter<T>(oldestFirst: readonly T[], finished: ReadonlySet<T>): T | null {
  let last: T | null = null;
  for (const entry of oldestFirst) {
    if (!finished.has(entry)) break;
    last = entry;
  }
  return last;
}

export async function indexReceiptsFrom(conn: Connection, source: SignatureSource, budget: number): Promise<Outcome<IndexReport>> {
  const cursor = (await db.select().from(cursors).where(eq(cursors.key, CURSOR_KEY)).limit(1))[0];

  // ── list every signature newer than the cursor, newest first ────────────────────────
  const listed = await signaturesSince(source, cursor?.signature);
  if (!listed.ok) return listed;
  const fresh = listed.value;

  const holds: string[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  // ── oldest first, within the budget, so the cursor advances behind what is done ─────
  const ordered = [...fresh].reverse().slice(0, Math.max(1, budget));
  const finished = new Set<Listed>();
  const now = Math.floor(Date.now() / 1000);
  const hold = (entry: Listed, why: string) => {
    const stale = typeof entry.blockTime === "number" && now - entry.blockTime > GIVE_UP_AFTER_SECONDS;
    holds.push(`${entry.signature.slice(0, 8)}…: ${why}${stale ? " (given up after half an hour)" : ""}`);
    if (stale) finished.add(entry);
  };
  // One batch per 25 signatures, not one request per signature: see lib/solana/batch.ts.
  const bySignature = await transactionsFor(
    conn,
    ordered.filter((e) => !e.err).map((e) => e.signature),
  );
  for (const entry of ordered) {
    if (entry.err) {
      skipped += 1;
      finished.add(entry);
      continue;
    }
    const tx = bySignature.get(entry.signature) ?? null;
    if (!tx) {
      hold(entry, "the transaction could not be fetched.");
      continue;
    }
    const found = await receiptInTransaction(conn, entry.signature, tx);
    if (!found.ok) {
      // Most signatures are rule changes and book openings: no receipt.
      if (!/did not write a Scrip receipt/.test(found.why)) hold(entry, found.why);
      else finished.add(entry);
      skipped += 1;
      continue;
    }
    if (!found.value.wrote) {
      // A measurement or a match. The receipt stays filed under the transaction that wrote it;
      // only what can change after that — the two measurements — is copied.
      const t = found.value.receipt;
      const m7 = toSafeNumber(t.measured7d?.balanceRaw ?? 0n, "measured");
      const m30 = toSafeNumber(t.measured30d?.balanceRaw ?? 0n, "measured");
      if (!m7.ok || !m30.ok) {
        hold(entry, !m7.ok ? m7.why : !m30.ok ? m30.why : "");
        continue;
      }
      await db
        .update(receipts)
        .set({ measured7dAt: t.measured7d?.at ?? 0, measured7dRaw: m7.value, measured30dAt: t.measured30d?.at ?? 0, measured30dRaw: m30.value })
        .where(eq(receipts.pda, found.value.address));
      updated += 1;
      finished.add(entry);
      continue;
    }
    const r = found.value.view;
    const nums = {
      basis: toSafeNumber(r.basisUsdc, "basis"),
      paid: toSafeNumber(r.paidUsdc, "paid"),
      amount: toSafeNumber(r.amountRaw, "amount"),
      slot: toSafeNumber(r.settledSlot, "slot"),
      price: toSafeNumber(r.price?.price ?? 0n, "price"),
      conf: toSafeNumber(r.price?.conf ?? 0n, "conf"),
      m7: toSafeNumber(r.measured7d?.balanceRaw ?? 0n, "measured"),
      m30: toSafeNumber(r.measured30d?.balanceRaw ?? 0n, "measured"),
    };
    const bad = Object.values(nums).find((n) => !n.ok);
    if (bad && !bad.ok) {
      hold(entry, bad.why);
      continue;
    }
    const row = {
      pda: r.address,
      sig: r.signature,
      kind: r.kind,
      recipient: r.recipient,
      payer: r.payer ?? "",
      submitter: r.submitter,
      book: r.book,
      releaseId: r.releaseId,
      runId: r.runId ?? "",
      reasonHash: Buffer.from(r.reasonHash).toString("hex"),
      reason: r.reason ?? "",
      basisUsdc: nums.basis.ok ? nums.basis.value : 0,
      rateBps: r.rateBps,
      paidUsdc: nums.paid.ok ? nums.paid.value : 0,
      asset: r.asset,
      amountRaw: nums.amount.ok ? nums.amount.value : 0,
      priceFeed: r.price?.feed ?? "",
      price: nums.price.ok ? nums.price.value : 0,
      priceExpo: r.price?.expo ?? 0,
      priceConf: nums.conf.ok ? nums.conf.value : 0,
      pricePublishTime: r.price?.publishTime ?? 0,
      settledSlot: nums.slot.ok ? nums.slot.value : 0,
      settledUnix: r.settledUnix,
      measured7dAt: r.measured7d?.at ?? 0,
      measured7dRaw: nums.m7.ok ? nums.m7.value : 0,
      measured30dAt: r.measured30d?.at ?? 0,
      measured30dRaw: nums.m30.ok ? nums.m30.value : 0,
    };
    const existing = (await db.select({ id: receipts.id }).from(receipts).where(eq(receipts.pda, r.address)).limit(1))[0];
    // An attribution that could not be read leaves the entry unfinished, so the cursor waits.
    let attributionHeld = false;
    if (existing) {
      await db.update(receipts).set(row).where(eq(receipts.id, existing.id));
      updated += 1;
    } else {
      let attributedJson = "[]";
      if (r.kind === "sweep") {
        const attributed = await attributeSweep(conn, r.recipient, r.settledSlot, r.basisUsdc);
        if (attributed.ok) attributedJson = JSON.stringify(attributed.value);
        else {
          hold(entry, `attribution — ${attributed.why}`);
          attributionHeld = true;
        }
      }
      const id = newId("rcp");
      await db.insert(receipts).values({ id, ...row, attributedJson });
      added += 1;
      // The arrival, as one message, to whoever linked a chat. Never awaited into the index.
      void notifyReceipt({ id, ...row, attributedJson, createdAt: Math.floor(Date.now() / 1000) }).catch(() => undefined);
    }
    // A grant's reason travels as the memo of the transaction that sealed it.
    if (r.kind === "grant" && r.reason) {
      await db.update(grants).set({ reason: r.reason }).where(eq(grants.pda, r.book));
    }
    if (!attributionHeld) finished.add(entry);
  }

  const done = cursorAfter(ordered, finished);
  if (done) {
    await db
      .insert(cursors)
      .values({ key: CURSOR_KEY, signature: done.signature, slot: done.slot, updatedAt: Math.floor(Date.now() / 1000) })
      .onConflictDoUpdate({
        target: cursors.key,
        set: { signature: done.signature, slot: done.slot, updatedAt: Math.floor(Date.now() / 1000) },
      });
  }

  return ok({ scanned: ordered.length, added, updated, skipped, holds });
}

const ANCHOR_KEY = "receipts:anchors";

/**
 * RECEIPTS FILED UNDER THE WRONG TRANSACTION, MOVED. Until 8 October the indexer filed a receipt
 * under whichever transaction touched it last — its 7-day measurement, or a sponsor's match — so
 * every link to it opened the wrong transaction. Each row is checked once, oldest first: a
 * signature that landed in the receipt's own slot is its writer; any other moves to the one
 * that is. The pass remembers how far it got and, at the end of the table, stops for good: the
 * indexer files a receipt nowhere but under its writer now.
 */
export async function healAnchors(conn: Connection = connection(), limit = 200): Promise<Outcome<number>> {
  const mark = (await db.select().from(cursors).where(eq(cursors.key, ANCHOR_KEY)).limit(1))[0];
  if (mark?.signature === "done") return ok(0);
  const save = async (signature: string, slot: number) =>
    db
      .insert(cursors)
      .values({ key: ANCHOR_KEY, signature, slot, updatedAt: Math.floor(Date.now() / 1000) })
      .onConflictDoUpdate({ target: cursors.key, set: { signature, slot, updatedAt: Math.floor(Date.now() / 1000) } });
  const rows = await db
    .select({ id: receipts.id, pda: receipts.pda, sig: receipts.sig, slot: receipts.settledSlot })
    .from(receipts)
    .where(gt(receipts.settledSlot, mark?.slot ?? -1))
    .orderBy(asc(receipts.settledSlot))
    .limit(limit);
  if (rows.length === 0) {
    await save("done", mark?.slot ?? 0);
    return ok(0);
  }
  let statuses: Array<{ slot: number } | null> = [];
  try {
    for (let i = 0; i < rows.length; i += 200) {
      const got = await conn.getSignatureStatuses(
        rows.slice(i, i + 200).map((r) => r.sig),
        { searchTransactionHistory: true },
      );
      statuses = statuses.concat(got.value);
    }
  } catch (err) {
    return held(`Could not check where receipts are filed (${err instanceof Error ? err.message : String(err)}).`);
  }
  let moved = 0;
  for (const [i, row] of rows.entries()) {
    if (statuses[i]?.slot === row.slot) continue;
    const writer = await writerOf(conn, new PublicKey(row.pda), BigInt(row.slot));
    if (!writer) return held(`Could not find the transaction that wrote receipt ${row.pda.slice(0, 8)}…; checking again next run.`);
    if (writer === row.sig) continue;
    try {
      await db.update(receipts).set({ sig: writer }).where(eq(receipts.id, row.id));
      moved += 1;
    } catch (err) {
      return held(`Could not move receipt ${row.pda.slice(0, 8)}… (${err instanceof Error ? err.message : String(err)}).`);
    }
  }
  await save("checking", rows[rows.length - 1]!.slot);
  return ok(moved);
}

/**
 * Re-read receipts whose windows may have been measured since we last looked, so the ledger's
 * keep-rate reflects the chain. Bounded: only receipts old enough to have a window due.
 */
/**
 * REASONS THAT WERE MISSED. Until 2026-09-23 a claimed gift was indexed with no reason: its
 * memo is in the transaction that funded it, and the receipt is written by the claim, which
 * carries none. receiptFromTransaction now looks where the reason actually lives; this pass
 * re-reads receipts cached with an empty reason but a non-zero reason hash, a few per run,
 * so the cache heals without a full re-index. Only a memo that hashes to the stored hash is
 * ever written, so a heal can add a reason but never change one.
 */
export async function healReasons(conn: Connection = connection(), limit = 10): Promise<Outcome<number>> {
  const zero = "0".repeat(64);
  const rows = await db
    .select({ id: receipts.id, sig: receipts.sig })
    .from(receipts)
    .where(and(eq(receipts.reason, ""), ne(receipts.reasonHash, zero)))
    .limit(limit);
  let healed = 0;
  for (const row of rows) {
    const tx = await conn.getTransaction(row.sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
    if (!tx) continue;
    const r = await receiptFromTransaction(conn, row.sig, tx);
    if (!r.ok || !r.value.reason) continue;
    await db.update(receipts).set({ reason: r.value.reason }).where(eq(receipts.id, row.id));
    healed += 1;
  }
  return ok(healed);
}

export async function refreshMeasurements(conn: Connection = connection(), now = Math.floor(Date.now() / 1000), limit = 50): Promise<Outcome<number>> {
  const due = await db
    .select({ id: receipts.id, pda: receipts.pda })
    .from(receipts)
    .where(
      sql`(${receipts.measured7dAt} = 0 AND ${receipts.settledUnix} + 7 * 86400 <= ${now}) OR (${receipts.measured30dAt} = 0 AND ${receipts.settledUnix} + 30 * 86400 <= ${now})`,
    )
    .limit(limit);
  let refreshed = 0;
  for (const row of due) {
    const r = await readReceiptAccount(conn, new PublicKey(row.pda));
    if (!r.ok || !r.value) continue;
    const m7 = toSafeNumber(r.value.measured7d?.balanceRaw ?? 0n, "measured");
    const m30 = toSafeNumber(r.value.measured30d?.balanceRaw ?? 0n, "measured");
    if (!m7.ok || !m30.ok) continue;
    await db
      .update(receipts)
      .set({
        measured7dAt: r.value.measured7d?.at ?? 0,
        measured7dRaw: m7.value,
        measured30dAt: r.value.measured30d?.at ?? 0,
        measured30dRaw: m30.value,
      })
      .where(eq(receipts.id, row.id));
    refreshed += 1;
  }
  return ok(refreshed);
}

/** Mirror every Book. One `getProgramAccounts` on the discriminator; small at any scale this reaches. */
export async function indexBooks(conn: Connection = connection(), now = Math.floor(Date.now() / 1000)): Promise<Outcome<number>> {
  let accounts;
  let handles;
  try {
    [accounts, handles] = await Promise.all([
      conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Book")] }),
      conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Handle")] }),
    ]);
  } catch (err) {
    return held(`Could not list books (${err instanceof Error ? err.message : String(err)}).`);
  }
  // Who a handle names lives on the Handle account: a person, or an organisation.
  const kindOf = new Map<string, "person" | "org">();
  for (const { account } of handles) {
    const h = decodeHandle(account.data);
    if (h.ok) kindOf.set(h.value.owner, h.value.kind);
  }
  let n = 0;
  for (const { pubkey, account } of accounts) {
    const b = decodeBook(account.data);
    if (!b.ok) continue;
    const rent = Number(await rentFor(conn, account.data.length));
    const nums = [b.value.rule.floorUsdc, b.value.rule.capUsdc, b.value.rule.watermark].map((v) => toSafeNumber(v, "rule"));
    if (nums.some((x) => !x.ok)) continue;
    const row = {
      owner: b.value.owner,
      pda: pubkey.toBase58(),
      slug: b.value.slug,
      asset: b.value.asset,
      openedUnix: b.value.openedUnix,
      ruleEnabled: b.value.rule.enabled ? 1 : 0,
      rateBps: b.value.rule.rateBps,
      escalateBps: b.value.rule.escalateBps,
      floorUsdc: Number(b.value.rule.floorUsdc),
      capUsdc: Number(b.value.rule.capUsdc),
      toleranceBps: b.value.rule.toleranceBps,
      watermarkUsdc: Number(b.value.rule.watermark),
      enabledUnix: b.value.rule.enabledUnix,
      sweeps: b.value.rule.sweeps,
      floatLamports: Math.max(0, account.lamports - rent),
      kind: kindOf.get(b.value.owner) ?? "person",
      seenAt: now,
    };
    await db
      .insert(books)
      .values({ id: newId("book"), ...row })
      .onConflictDoUpdate({ target: books.pda, set: row });
    n += 1;
  }
  return ok(n);
}

/** Mirror every Grant account: the schedule, what has vested, the float. The reasons come with the receipts. */
export async function indexGrants(conn: Connection = connection(), now = Math.floor(Date.now() / 1000)): Promise<Outcome<number>> {
  let accounts;
  try {
    accounts = await conn.getProgramAccounts(SCRIP_PROGRAM_ID, { commitment: "confirmed", filters: [discriminatorFilter("Grant")] });
  } catch (err) {
    return held(`Could not list grants (${err instanceof Error ? err.message : String(err)}).`);
  }
  let n = 0;
  const rentByLen = new Map<number, number>();
  for (const { pubkey, account } of accounts) {
    const g = decodeGrant(account.data);
    if (!g.ok) continue;
    let rent = rentByLen.get(account.data.length);
    if (rent === undefined) {
      rent = Number(await rentFor(conn, account.data.length));
      rentByLen.set(account.data.length, rent);
    }
    const nums = [g.value.totalRaw, g.value.releasedRaw, g.value.declaredUsdc, g.value.releaseCapRaw ?? 0n].map((v) => toSafeNumber(v, "grant"));
    if (nums.some((x) => !x.ok)) continue;
    const row = {
      pda: pubkey.toBase58(),
      payer: g.value.payer,
      recipient: g.value.recipient,
      asset: g.value.asset,
      grantId: g.value.grantId,
      totalRaw: Number(g.value.totalRaw),
      releasedRaw: Number(g.value.releasedRaw),
      releaseCapRaw: g.value.releaseCapRaw === null ? null : Number(g.value.releaseCapRaw),
      startUnix: g.value.startUnix,
      cliffSecs: g.value.cliffSecs,
      durationSecs: g.value.durationSecs,
      revocable: g.value.revocable ? 1 : 0,
      sealed: g.value.sealed ? 1 : 0,
      state: g.value.state,
      declaredUsdc: Number(g.value.declaredUsdc),
      runId: g.value.runId ?? "",
      createdUnix: g.value.createdUnix,
      vests: g.value.vests,
      floatLamports: Math.max(0, account.lamports - rent),
      seenAt: now,
    };
    await db
      .insert(grants)
      .values({ id: newId("grt"), ...row })
      .onConflictDoUpdate({ target: grants.pda, set: row });
    n += 1;
  }
  return ok(n);
}

// ── what the ledger reads ────────────────────────────────────────────────────────────────

/** A grant's own receipt records stock in escrow; the vests deliver it. Counting both would count it twice. */
const DELIVERED = sql`${receipts.kind} <> 'grant'`;

export async function ledgerTotals() {
  const [r] = await db
    .select({
      receipts: sql<number>`count(*)`,
      paid: sql<number>`coalesce(sum(case when ${receipts.kind} <> 'grant' then ${receipts.paidUsdc} else 0 end), 0)`,
      recipients: sql<number>`count(distinct ${receipts.recipient})`,
      sweeps: sql<number>`sum(case when ${receipts.kind} = 'sweep' then 1 else 0 end)`,
      vests: sql<number>`sum(case when ${receipts.kind} = 'vest' then 1 else 0 end)`,
      grants: sql<number>`sum(case when ${receipts.kind} = 'grant' then 1 else 0 end)`,
    })
    .from(receipts);
  const [b] = await db.select({ on: sql<number>`sum(${books.ruleEnabled})`, total: sql<number>`count(*)` }).from(books);
  return {
    receipts: Number(r?.receipts ?? 0),
    paidUsdc: BigInt(Math.round(Number(r?.paid ?? 0))),
    recipients: Number(r?.recipients ?? 0),
    sweeps: Number(r?.sweeps ?? 0),
    vests: Number(r?.vests ?? 0),
    grants: Number(r?.grants ?? 0),
    rulesOn: Number(b?.on ?? 0),
    books: Number(b?.total ?? 0),
  };
}

/** Units delivered, per asset, for the ledger's "units delivered" line. */
export async function unitsByAsset() {
  return db
    .select({ asset: receipts.asset, amountRaw: sql<number>`coalesce(sum(${receipts.amountRaw}), 0)`, count: sql<number>`count(*)` })
    .from(receipts)
    .where(DELIVERED)
    .groupBy(receipts.asset);
}

export async function recentReceipts(limit = 25) {
  return db.select().from(receipts).orderBy(desc(receipts.settledUnix)).limit(limit);
}

export async function receiptsFor(recipient: string, limit = 50) {
  return db.select().from(receipts).where(eq(receipts.recipient, recipient)).orderBy(desc(receipts.settledUnix)).limit(limit);
}

/** Every delivered receipt, for keep-rate: a grant's escrow receipt is not a delivery. */
export async function allReceiptRows() {
  return db.select().from(receipts).where(DELIVERED);
}

/** Every keeper that has ever submitted a sweep, from the receipts' own `submitter` field. */
export async function keepersFromReceipts() {
  const rows = await db
    .select({
      keeper: receipts.submitter,
      sweeps: sql<number>`count(*)`,
      lastAt: sql<number>`max(${receipts.settledUnix})`,
      firstAt: sql<number>`min(${receipts.settledUnix})`,
      books: sql<number>`count(distinct ${receipts.book})`,
      paid: sql<number>`coalesce(sum(${receipts.paidUsdc}), 0)`,
    })
    .from(receipts)
    .where(sql`${receipts.kind} in ('sweep', 'vest')`)
    .groupBy(receipts.submitter)
    .orderBy(desc(sql`max(${receipts.settledUnix})`));
  return rows.map((r) => ({ keeper: r.keeper, sweeps: Number(r.sweeps), lastAt: Number(r.lastAt), firstAt: Number(r.firstAt), books: Number(r.books), paidUsdc: BigInt(Math.round(Number(r.paid))) }));
}

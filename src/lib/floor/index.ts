import "server-only";

import { desc, gt, inArray, sql } from "drizzle-orm";
import { resolveAssets } from "@/lib/assets/stand-in";
import { db } from "@/lib/db";
import { books, multipliers, receipts } from "@/lib/db/schema";
import { type ReceiptRow, keepRate } from "@/lib/keep-rate";
import { keeperHealth } from "@/lib/keeper/health";
import { allReceiptRows, keepersFromReceipts, ledgerTotals } from "@/lib/ledger/indexer";
import { type Market, market } from "@/lib/market";
import { nyseSession, newYork } from "@/lib/market/nyse";

/**
 * THE FLOOR — the network as the chain sees it, right now. Everything on it is a receipt,
 * a keeper's report, a mint's multiplier, or the clock. Nothing is a claim.
 */
export type TapeRow = {
  readonly id: string;
  readonly sig: string;
  readonly kind: "sweep" | "pay" | "gift" | "grant" | "vest";
  readonly who: string;
  readonly handle: string | null;
  readonly payerHandle: string | null;
  readonly usdc: string;
  readonly amountRaw: string;
  readonly symbol: string;
  readonly decimals: number | null;
  readonly reason: string;
  readonly settledUnix: number;
  readonly createdAt: number;
};

export type FloorView = {
  readonly at: number;
  readonly session: { readonly open: boolean; readonly line: string; readonly until: number };
  readonly tape: readonly TapeRow[];
  /** Arrivals that settled while the NYSE was closed, as a share of all arrivals. */
  readonly slept: { readonly count: number; readonly total: number; readonly bps: number };
  readonly keepRate7: { readonly bps: number; readonly receipts: number } | null;
  readonly keepRate30: { readonly bps: number; readonly receipts: number } | null;
  readonly keepers: { readonly roster: number; readonly sweeps: number; readonly vests: number; readonly lastAt: number | null; readonly alive: number; readonly watched: number };
  readonly actions: ReadonlyArray<{ readonly symbol: string; readonly mint: string; readonly multiplier: string | null; readonly lastEffectiveAt: number | null; readonly lastValue: string | null }>;
  readonly totals: { readonly receipts: number; readonly paidUsdc: string; readonly rulesOn: number; readonly people: number; readonly orgs: number };
  readonly market: Market;
};

const KINDS = ["sweep", "pay", "gift", "grant", "vest"] as const;
type Kind = (typeof KINDS)[number];
const kindOf = (k: string): Kind => ((KINDS as readonly string[]).includes(k) ? (k as Kind) : "sweep");

/** Receipt rows into tape rows, with handles for published registers and organisations. */
export async function tapeRows(rows: Array<typeof receipts.$inferSelect>): Promise<TapeRow[]> {
  const owners = [...new Set(rows.flatMap((r) => [r.recipient, r.payer].filter(Boolean)))];
  const named = owners.length > 0 ? await db.select({ owner: books.owner, slug: books.slug, published: books.published, kind: books.kind }).from(books).where(inArray(books.owner, owners)) : [];
  // A person is named only where they published; an organisation is always named.
  const handleOf = new Map(named.filter((b) => b.published === 1 || b.kind === "org").map((b) => [b.owner, b.slug] as const));
  const labels = await resolveAssets(rows.map((r) => r.asset));
  return rows.map((r) => ({
    id: r.id,
    sig: r.sig,
    kind: kindOf(r.kind),
    who: r.recipient,
    handle: handleOf.get(r.recipient) ?? null,
    payerHandle: r.payer ? (handleOf.get(r.payer) ?? null) : null,
    usdc: String(r.kind === "sweep" ? r.basisUsdc : r.paidUsdc),
    amountRaw: String(r.amountRaw),
    symbol: labels.get(r.asset)?.symbol ?? "units",
    decimals: labels.get(r.asset)?.decimals ?? null,
    reason: r.reason,
    settledUnix: r.settledUnix,
    createdAt: r.createdAt,
  }));
}

/** Rows the cache learned about after `since` (its own clock), newest last — what the tape appends. */
export async function tapeSince(since: number): Promise<TapeRow[]> {
  const rows = await db.select().from(receipts).where(gt(receipts.createdAt, since)).orderBy(desc(receipts.createdAt)).limit(20);
  return (await tapeRows(rows)).reverse();
}

function settledWhileClosed(unix: number): boolean {
  const ny = newYork(unix);
  const weekday = ny.weekday >= 1 && ny.weekday <= 5;
  const open = weekday && ny.minutes >= 9 * 60 + 30 && ny.minutes < 16 * 60;
  return !open;
}

export async function floorView(): Promise<FloorView> {
  const now = Math.floor(Date.now() / 1000);
  const [rows, all, totals, roster, health, mkt, orgCount] = await Promise.all([
    db.select().from(receipts).orderBy(desc(receipts.settledUnix)).limit(40),
    allReceiptRows(),
    ledgerTotals(),
    keepersFromReceipts(),
    keeperHealth(),
    market(),
    db.select({ n: sql<number>`count(*)` }).from(books).where(sql`${books.kind} = 'org'`),
  ]);
  const tape = await tapeRows(rows);
  const deliveries = all.filter((r) => r.kind !== "grant");
  const slept = deliveries.filter((r) => settledWhileClosed(r.settledUnix)).length;
  const kr = (w: 7 | 30) => {
    const k = keepRate(all.map(toRow), w, now);
    return k.ok ? { bps: k.value.bps, receipts: k.value.receipts } : null;
  };
  // The last recorded multiplier change per mint, for the corporate-actions line.
  const lastByMint = new Map<string, { value: string; effectiveAt: number }>();
  const recorded = await db.select().from(multipliers).orderBy(desc(multipliers.effectiveAt)).limit(50);
  for (const m of recorded) if (!lastByMint.has(m.mint)) lastByMint.set(m.mint, { value: m.value, effectiveAt: m.effectiveAt });
  return {
    at: now,
    session: nyseSession(now),
    tape,
    slept: { count: slept, total: deliveries.length, bps: deliveries.length > 0 ? Math.round((slept / deliveries.length) * 10_000) : 0 },
    keepRate7: kr(7),
    keepRate30: kr(30),
    keepers: {
      roster: roster.length,
      sweeps: roster.reduce((n, k) => n + k.sweeps, 0),
      vests: totals.vests,
      lastAt: roster[0]?.lastAt ?? null,
      alive: health.ok ? 1 : 0,
      watched: health.ok ? Object.keys(health.value.books).length : 0,
    },
    actions: mkt.rows
      .filter((r) => r.multiplier !== null || r.multiplierWhy !== null)
      .map((r) => ({ symbol: r.symbol, mint: r.mint, multiplier: r.multiplier, lastEffectiveAt: lastByMint.get(r.mint)?.effectiveAt ?? null, lastValue: lastByMint.get(r.mint)?.value ?? null })),
    totals: { receipts: totals.receipts, paidUsdc: totals.paidUsdc.toString(), rulesOn: totals.rulesOn, people: totals.recipients, orgs: Number(orgCount[0]?.n ?? 0) },
    market: mkt,
  };
}

function toRow(r: typeof receipts.$inferSelect): ReceiptRow {
  return {
    recipient: r.recipient,
    asset: r.asset,
    settledUnix: r.settledUnix,
    paidUsdc: BigInt(r.paidUsdc),
    amountRaw: BigInt(r.amountRaw),
    measured7dRaw: r.measured7dAt === 0 ? null : BigInt(r.measured7dRaw),
    measured30dRaw: r.measured30dAt === 0 ? null : BigInt(r.measured30dRaw),
  };
}

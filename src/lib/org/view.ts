import "server-only";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { resolveAssets } from "@/lib/assets/stand-in";
import { db } from "@/lib/db";
import { books, grants, receipts, runs } from "@/lib/db/schema";
import { type Outcome, ok } from "@/lib/outcome";

/**
 * AN ORGANISATION, AS THE CHAIN SEES IT — from the receipts it paid and the grants it opened.
 * Recipients are named by handle only where they published their register; otherwise they
 * are counted. Nothing here is a claim the receipts cannot back.
 */
export type OrgPerson = { readonly owner: string; readonly handle: string | null; readonly payments: number; readonly firstAt: number; readonly lastAt: number; readonly paidUsdc: string };
export type OrgRun = { readonly id: string; readonly label: string; readonly planned: number; readonly settled: number; readonly paidUsdc: string; readonly firstAt: number; readonly lastAt: number };
export type OrgGrant = {
  readonly pda: string;
  readonly recipient: string;
  readonly recipientHandle: string | null;
  readonly asset: string;
  readonly symbol: string;
  readonly decimals: number | null;
  readonly totalRaw: string;
  readonly releasedRaw: string;
  readonly startUnix: number;
  readonly cliffSecs: number;
  readonly durationSecs: number;
  readonly revocable: boolean;
  readonly sealed: boolean;
  readonly state: string;
  readonly reason: string;
  readonly declaredUsdc: string;
  readonly vests: number;
  readonly floatLamports: string;
};
export type OrgView = {
  readonly owner: string;
  readonly handle: string | null;
  readonly kind: "person" | "org";
  readonly published: boolean;
  readonly since: number | null;
  readonly peoplePaid: number;
  readonly payments: number;
  readonly paidUsdc: string;
  readonly delivered: ReadonlyArray<{ readonly asset: string; readonly symbol: string; readonly decimals: number | null; readonly amountRaw: string }>;
  readonly grantsActive: number;
  readonly grants: readonly OrgGrant[];
  readonly runs: readonly OrgRun[];
  readonly people: readonly OrgPerson[];
  readonly recent: ReadonlyArray<{ readonly id: string; readonly sig: string; readonly kind: string; readonly recipient: string; readonly recipientHandle: string | null; readonly paidUsdc: string; readonly amountRaw: string; readonly asset: string; readonly symbol: string; readonly decimals: number | null; readonly reason: string; readonly settledUnix: number; readonly runId: string }>;
};

const PAID = (owner: string) => and(eq(receipts.payer, owner), ne(receipts.kind, "sweep"));

export async function orgView(owner: string): Promise<Outcome<OrgView>> {
  const [bookRow] = await db.select({ slug: books.slug, kind: books.kind, published: books.published, openedUnix: books.openedUnix }).from(books).where(eq(books.owner, owner)).limit(1);
  const [totals] = await db
    .select({
      payments: sql<number>`count(*)`,
      people: sql<number>`count(distinct ${receipts.recipient})`,
      paid: sql<number>`coalesce(sum(case when ${receipts.kind} <> 'vest' then ${receipts.paidUsdc} else 0 end), 0)`,
      first: sql<number>`coalesce(min(${receipts.settledUnix}), 0)`,
    })
    .from(receipts)
    .where(PAID(owner));
  const deliveredRows = await db
    .select({ asset: receipts.asset, amountRaw: sql<number>`coalesce(sum(${receipts.amountRaw}), 0)` })
    .from(receipts)
    .where(and(PAID(owner), ne(receipts.kind, "grant")))
    .groupBy(receipts.asset);
  const grantRows = await db.select().from(grants).where(eq(grants.payer, owner)).orderBy(desc(grants.createdUnix));
  const runRows = await db
    .select({
      id: receipts.runId,
      settled: sql<number>`count(*)`,
      paid: sql<number>`coalesce(sum(case when ${receipts.kind} <> 'vest' then ${receipts.paidUsdc} else 0 end), 0)`,
      first: sql<number>`min(${receipts.settledUnix})`,
      last: sql<number>`max(${receipts.settledUnix})`,
    })
    .from(receipts)
    .where(and(PAID(owner), ne(receipts.runId, "")))
    .groupBy(receipts.runId)
    .orderBy(desc(sql`max(${receipts.settledUnix})`));
  const runMeta = runRows.length > 0 ? await db.select().from(runs).where(inArray(runs.id, runRows.map((r) => r.id))) : [];
  const metaOf = new Map(runMeta.map((r) => [r.id, r] as const));
  const peopleRows = await db
    .select({
      owner: receipts.recipient,
      payments: sql<number>`count(*)`,
      first: sql<number>`min(${receipts.settledUnix})`,
      last: sql<number>`max(${receipts.settledUnix})`,
      paid: sql<number>`coalesce(sum(case when ${receipts.kind} <> 'vest' then ${receipts.paidUsdc} else 0 end), 0)`,
    })
    .from(receipts)
    .where(PAID(owner))
    .groupBy(receipts.recipient)
    .orderBy(desc(sql`max(${receipts.settledUnix})`));
  const recentRows = await db.select().from(receipts).where(PAID(owner)).orderBy(desc(receipts.settledUnix)).limit(40);

  const recipients = [...new Set([...peopleRows.map((p) => p.owner), ...grantRows.map((g) => g.recipient)])];
  const published = recipients.length > 0 ? await db.select({ owner: books.owner, slug: books.slug, published: books.published }).from(books).where(inArray(books.owner, recipients)) : [];
  const handleOf = new Map(published.filter((b) => b.published === 1).map((b) => [b.owner, b.slug] as const));
  const labels = await resolveAssets([...deliveredRows.map((d) => d.asset), ...grantRows.map((g) => g.asset), ...recentRows.map((r) => r.asset)]);
  const label = (mint: string) => labels.get(mint);

  return ok({
    owner,
    handle: bookRow?.slug ?? null,
    kind: bookRow?.kind === "org" ? "org" : "person",
    published: (bookRow?.published ?? 0) === 1,
    since: totals && Number(totals.first) > 0 ? Number(totals.first) : (bookRow?.openedUnix ?? null),
    peoplePaid: Number(totals?.people ?? 0),
    payments: Number(totals?.payments ?? 0),
    paidUsdc: String(Math.round(Number(totals?.paid ?? 0))),
    delivered: deliveredRows.map((d) => ({ asset: d.asset, symbol: label(d.asset)?.symbol ?? "units", decimals: label(d.asset)?.decimals ?? null, amountRaw: String(Math.round(Number(d.amountRaw))) })),
    grantsActive: grantRows.filter((g) => g.sealed === 1 && g.state === "active").length,
    grants: grantRows.map((g) => ({
      pda: g.pda,
      recipient: g.recipient,
      recipientHandle: handleOf.get(g.recipient) ?? null,
      asset: g.asset,
      symbol: label(g.asset)?.symbol ?? "units",
      decimals: label(g.asset)?.decimals ?? null,
      totalRaw: String(g.totalRaw),
      releasedRaw: String(g.releasedRaw),
      startUnix: g.startUnix,
      cliffSecs: g.cliffSecs,
      durationSecs: g.durationSecs,
      revocable: g.revocable === 1,
      sealed: g.sealed === 1,
      state: g.state,
      reason: g.reason,
      declaredUsdc: String(g.declaredUsdc),
      vests: g.vests,
      floatLamports: String(g.floatLamports),
    })),
    runs: runRows.map((r) => ({ id: r.id, label: metaOf.get(r.id)?.label ?? "", planned: metaOf.get(r.id)?.planned ?? Number(r.settled), settled: Number(r.settled), paidUsdc: String(Math.round(Number(r.paid))), firstAt: Number(r.first), lastAt: Number(r.last) })),
    people: peopleRows.map((p) => ({ owner: p.owner, handle: handleOf.get(p.owner) ?? null, payments: Number(p.payments), firstAt: Number(p.first), lastAt: Number(p.last), paidUsdc: String(Math.round(Number(p.paid))) })),
    recent: recentRows.map((r) => ({
      id: r.id,
      sig: r.sig,
      kind: r.kind,
      recipient: r.recipient,
      recipientHandle: handleOf.get(r.recipient) ?? null,
      paidUsdc: String(r.paidUsdc),
      amountRaw: String(r.amountRaw),
      asset: r.asset,
      symbol: label(r.asset)?.symbol ?? "units",
      decimals: label(r.asset)?.decimals ?? null,
      reason: r.reason,
      settledUnix: r.settledUnix,
      runId: r.runId,
    })),
  });
}

/** A payroll run: everyone it paid, from the receipts that carry its id. */
export async function runView(runId: string) {
  const [meta] = await db.select().from(runs).where(eq(runs.id, runId)).limit(1);
  const rows = await db.select().from(receipts).where(eq(receipts.runId, runId)).orderBy(desc(receipts.settledUnix));
  if (!meta && rows.length === 0) return null;
  const payer = meta?.payer ?? rows[0]?.payer ?? "";
  const recipients = [...new Set(rows.map((r) => r.recipient))];
  const published = recipients.length > 0 ? await db.select({ owner: books.owner, slug: books.slug, published: books.published }).from(books).where(inArray(books.owner, recipients)) : [];
  const handleOf = new Map(published.filter((b) => b.published === 1).map((b) => [b.owner, b.slug] as const));
  const [payerRow] = payer ? await db.select({ slug: books.slug, kind: books.kind }).from(books).where(eq(books.owner, payer)).limit(1) : [];
  const labels = await resolveAssets(rows.map((r) => r.asset));
  return {
    id: runId,
    label: meta?.label ?? "",
    planned: meta?.planned ?? rows.length,
    payer,
    payerHandle: payerRow?.slug ?? null,
    createdAt: meta?.createdAt ?? null,
    settled: rows.length,
    paidUsdc: String(rows.reduce((n, r) => n + (r.kind === "vest" ? 0 : r.paidUsdc), 0)),
    rows,
    handleOf,
    labels,
  };
}

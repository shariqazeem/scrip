import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import { operatorAddresses } from "@/lib/bonus";
import { db } from "@/lib/db";
import { books, planRequests } from "@/lib/db/schema";
import { prices as jupPrices } from "@/lib/jupiter/client";
import { nameOf } from "@/lib/save/names";
import { plansOf } from "./read";
import { type PlanRequest, stillWaiting, takesRequests } from "./requests";

/**
 * SCRIP'S OWN PLAN, OPEN TO REQUESTS — the newest Plan an operator funds whose escrow still has
 * room (`takesRequests`). Savers see its terms and can ask to join; the sponsor invites by hand.
 * Everything in it is read from the chain; plain numbers, so a client component can carry it.
 */
export type OpenPlan = {
  readonly pda: string;
  readonly sponsor: string;
  /** Who funds it, as a person reads it: a handle, or "Scrip's founder" for the founder's wallet. */
  readonly sponsorName: string;
  readonly matchBps: number;
  readonly capUsd: number;
  readonly stockName: string;
};

const FOUNDER = "EsWeMEvuLDV2Q4CXigZbETzqXfEQwZntQjwD4Cy8AgY5";
const g = globalThis as typeof globalThis & { __scripOpenPlan?: { at: number; value: OpenPlan | null } };

export async function openPlan(): Promise<OpenPlan | null> {
  const hit = g.__scripOpenPlan;
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  let found: OpenPlan | null = null;
  try {
    const lists = await Promise.all(operatorAddresses().map((a) => plansOf(a)));
    const plans = lists.flatMap((r) => (r.ok ? r.value : [])).sort((a, b) => b.createdUnix - a.createdUnix);
    if (plans.length > 0) {
      const px = await jupPrices([...new Set(plans.map((p) => p.asset))]).catch(() => null);
      const priceOf = px && px.ok ? px.value : new Map<string, number>();
      for (const p of plans) {
        const price = priceOf.get(p.asset) ?? null;
        const escrowUsd = p.escrowRaw !== null && price !== null ? (Number(p.escrowRaw) / 10 ** p.decimals) * price : null;
        if (!takesRequests(escrowUsd, p.monthlyCapUsdc)) continue;
        found = {
          pda: p.pda,
          sponsor: p.sponsor,
          sponsorName: p.sponsorHandle ? `@${p.sponsorHandle}` : p.sponsor === FOUNDER ? "Scrip's founder" : "Scrip",
          matchBps: p.matchBps,
          capUsd: Number(p.monthlyCapUsdc) / 1e6,
          stockName: nameOf(p.symbol),
        };
        break;
      }
    }
  } catch {
    found = null;
  }
  g.__scripOpenPlan = { at: Date.now(), value: found };
  return found;
}

/** When this wallet asked to join this Plan, or null. */
export async function askedAt(plan: string, address: string): Promise<number | null> {
  const [row] = await db
    .select({ at: planRequests.createdAt })
    .from(planRequests)
    .where(and(eq(planRequests.plan, plan), eq(planRequests.address, address)))
    .limit(1);
  return row?.at ?? null;
}

/** Record a request, once per wallet and Plan; answers when it was first made. */
export async function askToJoin(plan: string, address: string): Promise<number> {
  await db.insert(planRequests).values({ plan, address }).onConflictDoNothing();
  return (await askedAt(plan, address)) ?? Math.floor(Date.now() / 1000);
}

/** Every request a Plan has had, oldest first. */
export async function requestsFor(plan: string): Promise<PlanRequest[]> {
  return db
    .select({ address: planRequests.address, createdAt: planRequests.createdAt })
    .from(planRequests)
    .where(eq(planRequests.plan, plan))
    .orderBy(asc(planRequests.createdAt));
}

export type WaitingRequest = PlanRequest & { readonly ruleOn: boolean; readonly saves: number };

/** The requests a sponsor has still to answer, with whether each wallet saves every payment. */
export async function waitingRequests(plan: string, members: readonly string[], sponsor: string): Promise<WaitingRequest[]> {
  const waiting = stillWaiting(await requestsFor(plan), members, sponsor);
  if (waiting.length === 0) return [];
  const rows = await db
    .select({ owner: books.owner, on: books.ruleEnabled, sweeps: books.sweeps })
    .from(books)
    .where(inArray(books.owner, waiting.map((w) => w.address)));
  const byOwner = new Map(rows.map((r) => [r.owner, r] as const));
  return waiting.map((w) => ({ ...w, ruleOn: (byOwner.get(w.address)?.on ?? 0) === 1, saves: byOwner.get(w.address)?.sweeps ?? 0 }));
}

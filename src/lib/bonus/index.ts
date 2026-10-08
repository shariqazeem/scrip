import "server-only";

import { desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { books, invites, receipts, saves } from "@/lib/db/schema";

/**
 * THE WELCOME BONUS — $5 of stock from Scrip on an invited wallet's first save, paid through
 * pay in stock with the reason below, so the receipt says exactly what it is. It is a bonus,
 * never a "match": that word belongs to a sponsor's Plan, enforced by the program.
 *
 * Invite-only and one per wallet: the operator adds an address; the page offers the payment
 * only once that wallet has saved and has never been paid a bonus. Whether it was paid is read
 * from the receipts (the reason is on the chain), never from a flag this table keeps.
 */
export const BONUS_REASON = "Welcome bonus from Scrip";
export const BONUS_USD = 5;
/** The most Scrip spends on bonuses in all, unless the deployment says otherwise. */
export function bonusBudgetUsd(): number {
  const n = Number(process.env.WELCOME_BONUS_BUDGET_USD ?? "50");
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

/** Scrip's operators: the addresses named in SCRIP_OPERATORS, or the founder. */
export function operatorAddresses(): string[] {
  return (process.env.SCRIP_OPERATORS ?? "EsWeMEvuLDV2Q4CXigZbETzqXfEQwZntQjwD4Cy8AgY5")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Who may run the operator page. */
export function isOperator(address: string | null | undefined): boolean {
  return !!address && operatorAddresses().includes(address);
}

export type InviteRow = {
  readonly address: string;
  readonly label: string;
  readonly createdAt: number;
  readonly saved: number;
  readonly ruleOn: boolean;
  readonly paidSig: string | null;
};

export async function inviteRows(): Promise<InviteRow[]> {
  const list = await db.select().from(invites).orderBy(desc(invites.createdAt));
  const out: InviteRow[] = [];
  for (const i of list) {
    const [s] = await db.select({ n: sql<number>`count(*)` }).from(saves).where(eq(saves.owner, i.address));
    const [b] = await db.select({ on: books.ruleEnabled }).from(books).where(eq(books.owner, i.address)).limit(1);
    const paid = (await db.select({ sig: receipts.sig, reason: receipts.reason }).from(receipts).where(eq(receipts.recipient, i.address)).limit(50)).find((r) => r.reason.startsWith(BONUS_REASON));
    out.push({ address: i.address, label: i.label, createdAt: i.createdAt, saved: Number(s?.n ?? 0), ruleOn: (b?.on ?? 0) === 1, paidSig: paid?.sig ?? null });
  }
  return out;
}

/** Every bonus paid so far, from the receipts' own reasons: the budget's spent side. */
export async function bonusesPaid(): Promise<{ count: number; usd: number }> {
  const [r] = await db
    .select({ n: sql<number>`count(*)`, paid: sql<number>`coalesce(sum(${receipts.paidUsdc}), 0)` })
    .from(receipts)
    .where(like(receipts.reason, `${BONUS_REASON}%`));
  return { count: Number(r?.n ?? 0), usd: Number(r?.paid ?? 0) / 1e6 };
}

import "server-only";

import { PublicKey } from "@solana/web3.js";
import { unpackAccount } from "@solana/spl-token";
import { inArray } from "drizzle-orm";
import { assetByMint } from "@/lib/assets/registry";
import { type Member, type Plan, decodeMember, decodePlan } from "@/lib/book/decode";
import { db } from "@/lib/db";
import { books } from "@/lib/db/schema";
import { type Outcome, held, ok } from "@/lib/outcome";
import { memoText } from "@/lib/save/parse";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID, discriminatorFilter, releaseIdFromHex } from "@/lib/solana/program";
import { readTxView } from "@/lib/solana/tx-view";
import { tokenProgramFor } from "@/lib/rule/instructions";
import { planEscrow, planPda } from "./instructions";

/**
 * PLANS, READ FROM THE CHAIN — every figure here is an account anyone can fetch: a Plan's terms
 * and what it has matched, its escrow's balance, each member's status and totals. Names are the
 * memo the Plan was opened with, read once from that transaction, because the chain keeps only
 * its hash.
 */
export type PlanView = Plan & {
  readonly pda: string;
  readonly name: string | null;
  readonly sponsorHandle: string | null;
  readonly asset: string;
  readonly symbol: string;
  readonly decimals: number;
  /** Stock still in the escrow, raw units; null when the escrow could not be read. */
  readonly escrowRaw: bigint | null;
};

export type MemberView = Member & { readonly pda: string; readonly ownerHandle: string | null };

const g = globalThis as typeof globalThis & { __scripPlanNames?: Map<string, string | null> };
const names = (g.__scripPlanNames ??= new Map<string, string | null>());

/** The memo a Plan was opened with: the oldest transaction that touched its account. */
async function planName(plan: string): Promise<string | null> {
  if (names.has(plan)) return names.get(plan)!;
  try {
    const conn = connection();
    const sigs = await conn.getSignaturesForAddress(new PublicKey(plan), { limit: 1000 }, "confirmed");
    const first = sigs.filter((s) => !s.err).at(-1);
    const view = first ? await readTxView(conn, first.signature) : null;
    const name = view ? memoText(view) : null;
    names.set(plan, name);
    return name;
  } catch {
    return null;
  }
}

async function handlesOf(owners: readonly string[]): Promise<Map<string, string>> {
  if (owners.length === 0) return new Map();
  const rows = await db.select({ owner: books.owner, slug: books.slug, kind: books.kind, published: books.published }).from(books).where(inArray(books.owner, [...owners]));
  // A person's name is shown only when they made their page public; an organisation's always.
  return new Map(rows.filter((r) => r.kind === "org" || r.published === 1).map((r) => [r.owner, r.slug] as const));
}

async function viewsOf(entries: ReadonlyArray<{ pubkey: PublicKey; plan: Plan }>): Promise<PlanView[]> {
  const conn = connection();
  const escrows = entries.map(({ plan }) => {
    const asset = assetByMint(plan.asset);
    const id = releaseIdFromHex(plan.planId);
    return asset && id.ok ? planEscrow(new PublicKey(plan.sponsor), id.value, asset) : null;
  });
  const wanted = escrows.filter((e): e is PublicKey => e !== null);
  const infos = wanted.length > 0 ? await conn.getMultipleAccountsInfo(wanted, "confirmed").catch(() => null) : [];
  const handles = await handlesOf([...new Set(entries.map((e) => e.plan.sponsor))]);
  const out: PlanView[] = [];
  for (const [i, { pubkey, plan }] of entries.entries()) {
    const asset = assetByMint(plan.asset);
    let escrowRaw: bigint | null = null;
    const escrow = escrows[i];
    if (escrow && infos) {
      const info = infos[wanted.indexOf(escrow)];
      if (info && asset) {
        try {
          escrowRaw = unpackAccount(escrow, info, tokenProgramFor(asset)).amount;
        } catch {
          escrowRaw = null;
        }
      } else if (info === null) escrowRaw = 0n;
    }
    out.push({
      ...plan,
      pda: pubkey.toBase58(),
      name: await planName(pubkey.toBase58()),
      sponsorHandle: handles.get(plan.sponsor) ?? null,
      symbol: asset?.symbol ?? "stock",
      decimals: asset?.decimals ?? 0,
      escrowRaw,
    });
  }
  return out.sort((a, b) => b.createdUnix - a.createdUnix);
}

/** Every Plan a sponsor opened, newest first. */
export async function plansOf(sponsor: string): Promise<Outcome<PlanView[]>> {
  try {
    const accounts = await connection().getProgramAccounts(SCRIP_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [discriminatorFilter("Plan"), { memcmp: { offset: 8, bytes: sponsor } }],
    });
    const entries = accounts.flatMap(({ pubkey, account }) => {
      const p = decodePlan(account.data);
      return p.ok ? [{ pubkey, plan: p.value }] : [];
    });
    return ok(await viewsOf(entries));
  } catch (err) {
    return held(`The Plans could not be read just now (${err instanceof Error ? err.message : String(err)}).`);
  }
}

/** One Plan by its address. */
export async function planAt(address: string): Promise<Outcome<PlanView | null>> {
  try {
    const key = new PublicKey(address);
    const info = await connection().getAccountInfo(key, "confirmed");
    if (!info) return ok(null);
    const p = decodePlan(info.data);
    if (!p.ok) return p;
    return ok((await viewsOf([{ pubkey: key, plan: p.value }]))[0] ?? null);
  } catch (err) {
    return held(`That Plan could not be read (${err instanceof Error ? err.message : String(err)}).`);
  }
}

/** Every member of a Plan, invited or joined. */
export async function membersOf(plan: string): Promise<Outcome<MemberView[]>> {
  try {
    const accounts = await connection().getProgramAccounts(SCRIP_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [discriminatorFilter("Member"), { memcmp: { offset: 8, bytes: plan } }],
    });
    const rows = accounts.flatMap(({ pubkey, account }) => {
      const m = decodeMember(account.data);
      return m.ok ? [{ ...m.value, pda: pubkey.toBase58() }] : [];
    });
    const handles = await handlesOf(rows.map((r) => r.owner));
    return ok(rows.map((r) => ({ ...r, ownerHandle: handles.get(r.owner) ?? null })).sort((a, b) => Number(b.totalMatchedUsdc - a.totalMatchedUsdc)));
  } catch (err) {
    return held(`The members could not be read just now (${err instanceof Error ? err.message : String(err)}).`);
  }
}

/** Every Plan this wallet belongs to or is invited into, with the Plan itself. */
export async function membershipsOf(owner: string): Promise<Outcome<Array<{ member: MemberView; plan: PlanView }>>> {
  try {
    const conn = connection();
    const accounts = await conn.getProgramAccounts(SCRIP_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [discriminatorFilter("Member"), { memcmp: { offset: 8 + 32, bytes: owner } }],
    });
    const members = accounts.flatMap(({ pubkey, account }) => {
      const m = decodeMember(account.data);
      return m.ok ? [{ ...m.value, pda: pubkey.toBase58(), ownerHandle: null }] : [];
    });
    if (members.length === 0) return ok([]);
    const planKeys = members.map((m) => new PublicKey(m.plan));
    const infos = await conn.getMultipleAccountsInfo(planKeys, "confirmed");
    const entries = planKeys.flatMap((pubkey, i) => {
      const info = infos[i];
      const p = info ? decodePlan(info.data) : null;
      return p && p.ok ? [{ pubkey, plan: p.value }] : [];
    });
    const plans = new Map((await viewsOf(entries)).map((p) => [p.pda, p] as const));
    return ok(members.flatMap((member) => (plans.has(member.plan) ? [{ member, plan: plans.get(member.plan)! }] : [])));
  } catch (err) {
    return held(`Your Plans could not be read just now (${err instanceof Error ? err.message : String(err)}).`);
  }
}

/** The Plan account for a sponsor and a hex plan id, for the actions that need both. */
export function planAddress(sponsor: string, planIdHex: string): Outcome<PublicKey> {
  const id = releaseIdFromHex(planIdHex);
  if (!id.ok) return id;
  return ok(planPda(new PublicKey(sponsor), id.value));
}

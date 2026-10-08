import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { loadBook } from "@/lib/book/read-book";
import { membershipsOf } from "@/lib/plan/read";
import { SUGGESTED_FLOAT_LAMPORTS } from "@/lib/rule/slice";
import { nameOf } from "@/lib/save/names";

export const dynamic = "force-dynamic";

/** A wallet must stay rent-exempt after paying: Solana's floor for an empty account. */
const WALLET_FLOOR_LAMPORTS = 890_880n;
/** The fee and a first stock account's deposit, at most, on top of what the record needs. */
const HEADROOM_LAMPORTS = 3_200_000n;

/**
 * WHAT THE START CARD NEEDS TO KNOW ABOUT A WALLET, in one read: whether it already saves
 * every payment, what it holds, which sponsors invited it, and how much SOL starting needs.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  try {
    new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }
  const [book, memberships] = await Promise.all([loadBook(owner), membershipsOf(owner)]);
  if (!book.ok) return NextResponse.json({ error: book.why }, { status: 503 });
  const b = book.value;
  const invites = (memberships.ok ? memberships.value : [])
    .filter((m) => m.member.status === "invited")
    .map((m) => ({
      plan: m.plan.pda,
      sponsor: m.plan.sponsor,
      sponsorName: m.plan.sponsorHandle ? `@${m.plan.sponsorHandle}` : m.plan.name,
      matchBps: m.plan.matchBps,
      monthlyCapUsdc: m.plan.monthlyCapUsdc.toString(),
      stock: nameOf(m.plan.symbol),
      suggestedRateBps: m.plan.defaultRateBps,
    }));
  const need = b.openCostLamports + b.usdcAccountRentLamports + SUGGESTED_FLOAT_LAMPORTS + WALLET_FLOOR_LAMPORTS + HEADROOM_LAMPORTS;
  return NextResponse.json({
    owner,
    saving: b.book
      ? { rateBps: b.book.rule.rateBps, enabled: b.book.rule.enabled, state: b.state, assetMint: b.asset?.mint ?? null, stock: b.asset ? nameOf(b.asset.symbol) : null, slug: b.book.slug }
      : null,
    usdc: b.usdc.balance.toString(),
    lamports: b.ownerLamports.toString(),
    needLamports: b.book ? "0" : need.toString(),
    invites,
  });
}

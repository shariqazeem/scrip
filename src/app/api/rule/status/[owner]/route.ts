import { NextResponse } from "next/server";
import { loadBook } from "@/lib/book/read-book";
import { keeperHealth } from "@/lib/keeper/health";

export const dynamic = "force-dynamic";

/**
 * THE RULE'S STATE, for the card: on, paused, delegate replaced, allowance exhausted, float
 * empty, no USDC account, off — plus what the keeper last did for this book.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const [book, keeper] = await Promise.all([loadBook(owner), keeperHealth()]);
  if (!book.ok) return NextResponse.json({ error: book.why }, { status: 503 });
  const b = book.value;
  const mine = keeper.ok ? (keeper.value.books[b.pda] ?? null) : null;
  return NextResponse.json({
    owner: b.owner,
    book: b.pda,
    state: b.state,
    asset: b.asset?.symbol ?? null,
    rule: b.book
      ? {
          enabled: b.book.rule.enabled,
          rateBps: b.book.rule.rateBps,
          rateNowBps: b.rateNowBps,
          escalateBps: b.book.rule.escalateBps,
          floorUsdc: b.book.rule.floorUsdc.toString(),
          capUsdc: b.book.rule.capUsdc.toString(),
          toleranceBps: b.book.rule.toleranceBps,
          watermark: b.book.rule.watermark.toString(),
          sweeps: b.book.rule.sweeps,
          enabledUnix: b.book.rule.enabledUnix,
        }
      : null,
    usdc: { exists: b.usdc.exists, balance: b.usdc.balance.toString(), delegate: b.usdc.delegate, delegatedAmount: b.usdc.delegatedAmount.toString() },
    floatLamports: b.floatLamports.toString(),
    sweepsCovered: b.sweepsCovered,
    keeper: keeper.ok ? { alive: true, at: keeper.value.at, lastSweep: mine?.lastSweepAt ?? null, lastReason: mine?.lastReason ?? null } : { alive: false, why: keeper.why },
    holds: b.holds,
  });
}

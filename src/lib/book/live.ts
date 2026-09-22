import "server-only";

import { eq, inArray } from "drizzle-orm";
import { resolveAssets } from "@/lib/assets/stand-in";
import { db } from "@/lib/db";
import { books, grants } from "@/lib/db/schema";
import { rowToArrival } from "@/components/stub/from-row";
import { indexReceipts, receiptsFor } from "@/lib/ledger/indexer";
import { attempt, type Outcome, ok } from "@/lib/outcome";
import { DEFAULT_MIN_INBOUND, computeSlice } from "@/lib/rule/slice";
import { connection } from "@/lib/solana/connection";
import { keeperHealth } from "@/lib/keeper/health";
import { market } from "@/lib/market";
import { type LiveArrival, type LiveView } from "./live-types";
import { loadBook } from "./read-book";
import { rpcUrl } from "@/lib/solana/cluster";
import { gateFor } from "@/lib/solana/limiter";

export type { LiveArrival, LiveView };

/**
 * THE LIVE VIEW — one payload the home screen and the public page poll every few seconds.
 *
 * It answers three questions from chain facts: is the rule on; has money landed that the
 * keeper has not swept yet; what has arrived, newest first. The receipt list comes from the
 * cache, which this refreshes incrementally (one page, throttled) so a sweep that just
 * settled appears on the next poll. Nothing here is a claim the chain cannot back.
 */
let lastIndexAt = 0;
/**
 * ONE ANSWER PER OWNER FOR A FEW SECONDS, however many tabs poll and however many people
 * open the front door at once: the endpoint is the scarce thing, and a register read three
 * seconds ago is the same register. The client polls every four seconds, so this is what
 * decides how often a poll costs a chain read, not how fresh a figure can be.
 */
const recent = new Map<string, { at: number; view: Promise<Outcome<LiveView>> }>();
const MEMO_MS = Number(process.env.SCRIP_LIVE_MEMO_MS ?? 3_500);

/** After a write the owner made (publish, a rule change), the next poll must not answer from memory. */
export function forgetLive(owner: string): void {
  recent.delete(owner);
}

/**
 * THE LAST GOOD READ OF EACH REGISTER. An endpoint that refuses — a public one throttling a
 * datacenter IP, a paid one hiccupping — must not turn a register into a blank page. The
 * last view that did read is kept, and served when a fresh one cannot be had. It carries the
 * `at` it was read at, and the register says so whenever that is more than a moment ago, so
 * a stale figure is never presented as current.
 */
const lastGood = new Map<string, LiveView>();

export async function liveView(owner: string, opts: { refresh?: boolean } = {}): Promise<Outcome<LiveView>> {
  const hit = recent.get(owner);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.view;
  // An endpoint that just refused will refuse this too. Waiting out its cool-off would buy
  // the reader nothing but a blank page; the last good read, with its own timestamp on it,
  // is on the screen immediately and says what it is.
  const kept = lastGood.get(owner);
  if (kept && gateFor(rpcUrl()).coolingFor() > 0) return ok(kept);
  const view = attempt("this register", () => assemble(owner, opts)).then((v) => {
    if (v.ok) {
      lastGood.set(owner, v.value);
      return v;
    }
    const kept = lastGood.get(owner);
    return kept ? ok(kept) : v;
  });
  recent.set(owner, { at: Date.now(), view });
  return view;
}

/** Refresh the receipts cache from the chain, one page deep, at most every six seconds across every caller. */
/**
 * WHO REFRESHES, AND WHO READS. A page render reads the cache and returns; walking the
 * chain for new receipts inside a render is what made the front door take twenty seconds to
 * its first byte, and it bought nothing — the same page polls `/api/book/live` four seconds
 * later, and that route, the maintenance route and the keeper all refresh. So every server
 * render passes `{ refresh: false }`, and the freshness comes from the poll.
 */
export async function refreshReceipts(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (now - lastIndexAt < 6) return;
  // An endpoint that just refused us will refuse this too; the cache already holds what it
  // holds, and a page that waits out a cool-off shows the same figures several seconds later.
  if (gateFor(rpcUrl()).coolingFor() > 0) return;
  lastIndexAt = now;
  await indexReceipts(connection(), 25, 1).catch(() => undefined);
}

async function assemble(owner: string, opts: { refresh?: boolean }): Promise<Outcome<LiveView>> {
  const now = Math.floor(Date.now() / 1000);
  if (opts.refresh !== false) await refreshReceipts();
  const [view, rows, keeper, bookRow, mkt, vestingRows] = await Promise.all([
    loadBook(owner, now),
    receiptsFor(owner, 40),
    keeperHealth(),
    db.select({ published: books.published, slug: books.slug }).from(books).where(eq(books.owner, owner)).limit(1),
    market().catch(() => null),
    db.select().from(grants).where(eq(grants.recipient, owner)),
  ]);
  if (!view.ok) return view;
  const payers = [...new Set(vestingRows.map((g) => g.payer))];
  const payerRows = payers.length > 0 ? await db.select({ owner: books.owner, slug: books.slug, kind: books.kind, published: books.published }).from(books).where(inArray(books.owner, payers)) : [];
  const payerHandle = new Map(payerRows.filter((b) => b.kind === "org" || b.published === 1).map((b) => [b.owner, b.slug] as const));
  const vestLabels = await resolveAssets(vestingRows.map((g) => g.asset));
  const v = view.value;
  const mine = keeper.ok ? (keeper.value.books[v.pda] ?? null) : null;
  const above = v.book?.rule.enabled && v.usdc.balance > v.book.rule.watermark ? v.usdc.balance - v.book.rule.watermark : 0n;
  const unswept = above >= DEFAULT_MIN_INBOUND ? above : 0n;
  // The exact slice waiting to be taken, not an estimate. A pending arrival that shows only
  // an ellipsis reads as a receipt that failed; the dollars are knowable to the cent and the
  // only thing that genuinely is not yet known is the units, which need a fill.
  const sliceNow =
    unswept > 0n && v.book
      ? computeSlice({
          balance: v.usdc.balance,
          watermark: v.book.rule.watermark,
          rateBps: v.rateNowBps,
          cap: v.book.rule.capUsdc,
          floor: v.book.rule.floorUsdc,
          minInbound: v.book.rule.minInbound,
        })
      : null;

  return ok({
    at: now,
    owner,
    handle: v.book?.slug ?? bookRow[0]?.slug ?? null,
    state: v.state,
    ruleOn: !!v.book?.rule.enabled,
    rateNowBps: v.rateNowBps,
    escalateBps: v.book?.rule.escalateBps ?? 0,
    asset: v.asset ? { mint: v.asset.mint, symbol: v.asset.symbol, name: v.asset.name, decimals: v.asset.decimals } : null,
    priceUsd: v.asset ? (mkt?.rows.find((r) => r.mint === v.asset?.mint)?.priceUsd ?? null) : null,
    usdc: { balance: v.usdc.balance.toString(), watermark: (v.book?.rule.watermark ?? 0n).toString(), delegatedAmount: v.usdc.delegatedAmount.toString() },
    unswept: unswept.toString(),
    sliceNext: sliceNow?.ok ? sliceNow.value.slice.toString() : "0",
    sweeps: v.book?.rule.sweeps ?? 0,
    floatLamports: v.floatLamports.toString(),
    sweepsCovered: v.sweepsCovered,
    keeper: { alive: keeper.ok, lastReason: mine?.lastReason ?? null, lastSweepAt: mine?.lastSweepAt ?? null },
    arrivals: rows.map((r) => rowToArrival(r, (mint) => (v.asset && v.asset.mint === mint ? v.asset : null))),
    holdings: v.holdings
      .filter((h) => h.qtyRaw > 0n)
      .map((h) => ({ mint: h.asset.mint, symbol: h.asset.symbol, decimals: h.asset.decimals, qtyRaw: h.qtyRaw.toString(), qtyAdjusted: h.qtyAdjusted.toString(), multiplier: h.multiplier })),
    published: (bookRow[0]?.published ?? 0) === 1,
    vesting: vestingRows
      .filter((g) => g.sealed === 1 && g.state !== "completed")
      .map((g) => ({
        pda: g.pda,
        payer: g.payer,
        payerHandle: payerHandle.get(g.payer) ?? null,
        symbol: vestLabels.get(g.asset)?.symbol ?? "units",
        decimals: vestLabels.get(g.asset)?.decimals ?? null,
        totalRaw: String(g.totalRaw),
        releasedRaw: String(g.releasedRaw),
        startUnix: g.startUnix,
        cliffSecs: g.cliffSecs,
        durationSecs: g.durationSecs,
        state: g.state,
        reason: g.reason,
      })),
  });
}

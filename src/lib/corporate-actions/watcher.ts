import "server-only";

import { and, desc, eq } from "drizzle-orm";
import type { Connection } from "@solana/web3.js";
import { type Asset, multiplierMints } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { multipliers, positions } from "@/lib/db/schema";
import { newId, nowSeconds } from "@/lib/db/keys";
import { type Decimal, formatDecimal, parseDecimal, toSafeNumber } from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";
import { type MultiplierSnapshot, multiplierInForce } from "./multiplier";
import { type MintRead, readMintMultiplier } from "./read-mint";
import { reconcile } from "./reconcile";

/**
 * THE MULTIPLIER WATCHER — the first thing built, because every number on every screen is
 * downstream of it.
 *
 * It does four things, in this order, and stops at the first one that cannot be done
 * honestly:
 *
 *   1. read each mint's ScaledUiAmount config off the chain
 *   2. resolve which multiplier is live at this instant (see multiplier.ts — it is not the
 *      field named `multiplier`)
 *   3. record the value if it is new, keeping the whole history rather than the latest value,
 *      so a reconciliation is auditable after the fact
 *   4. re-express every affected position from its RAW quantity, and report what moved
 *
 * A MINT THAT HOLDS DOES NOT STOP THE OTHERS. One unreachable issuer must not freeze a book
 * that also holds gold, so each asset is resolved independently and its hold travels with it
 * in the report. Nothing partial is written: a position is only re-expressed against a
 * multiplier that resolved cleanly.
 */

export type AssetOutcome = {
  readonly symbol: string;
  readonly mint: string;
  /** The live multiplier, when one could be resolved. */
  readonly inForce: string | null;
  /** A published change that has not activated yet. */
  readonly pending: { readonly value: string; readonly effectiveAt: number } | null;
  /** True when this run recorded a value we had not seen before. */
  readonly recorded: boolean;
  /** Positions whose adjusted quantity moved on this run. */
  readonly reconciled: number;
  /** Set when this asset held. The sentence is written to be shown, not only logged. */
  readonly heldWhy: string | null;
};

export type WatchReport = {
  readonly at: number;
  readonly assets: readonly AssetOutcome[];
  /** True when at least one asset held — the surface should say so rather than paint. */
  readonly anyHeld: boolean;
};

/**
 * How the watcher gets at a mint. The chain read is injected rather than imported so the
 * watcher's real work — deciding what is new, what to record, what to re-express — is
 * testable against exact multiplier sequences without a network in the loop. A test that
 * cannot run a 4-for-1 split through the watcher is not testing the watcher.
 */
export type MintReader = (asset: Asset, now: number) => Promise<Outcome<MintRead>>;

/** The production reader: the issuer's own mint account, and no API in the path. */
export function chainReader(connection: Connection): MintReader {
  return (asset, now) => readMintMultiplier(connection, asset, now);
}

export async function runWatcher(
  read1: MintReader,
  now: number = nowSeconds(),
  assets: readonly Asset[] = multiplierMints(),
): Promise<WatchReport> {
  const out: AssetOutcome[] = [];

  for (const asset of assets) {
    const read = await read1(asset, now);
    if (!read.ok) {
      out.push(blank(asset, read.why));
      continue;
    }
    if (read.value.kind === "unscaled") {
      // Nothing to track. A plain SPL mint's quantity is its own adjusted quantity.
      out.push({ ...blank(asset, null), inForce: "1" });
      continue;
    }

    const resolved = multiplierInForce(read.value.snapshot, now);
    if (!resolved.ok) {
      out.push(blank(asset, resolved.why));
      continue;
    }

    const recorded = await recordIfNew(asset, read.value.snapshot, resolved.value.raw, now);
    if (!recorded.ok) {
      out.push(blank(asset, recorded.why));
      continue;
    }

    const swept = await reconcilePositions(asset, resolved.value.value, now);
    out.push({
      symbol: asset.symbol,
      mint: asset.mint,
      inForce: resolved.value.raw,
      pending: resolved.value.pending
        ? { value: resolved.value.pending.raw, effectiveAt: resolved.value.pending.effectiveAt }
        : null,
      recorded: recorded.value,
      reconciled: swept.ok ? swept.value : 0,
      heldWhy: swept.ok ? null : swept.why,
    });
  }

  return { at: now, assets: out, anyHeld: out.some((a) => a.heldWhy !== null) };
}

function blank(asset: Asset, why: string | null): AssetOutcome {
  return {
    symbol: asset.symbol,
    mint: asset.mint,
    inForce: null,
    pending: null,
    recorded: false,
    reconciled: 0,
    heldWhy: why,
  };
}

/**
 * Record a multiplier the first time we see it in force, keyed on (mint, effective_at).
 *
 * The history is kept, not just the latest value, because a reconciliation nobody can audit
 * afterwards is indistinguishable from one we made up. `seen_at` is when WE looked;
 * `effective_at` is when the issuer activates. Conflating the two reconciles a day early.
 */
async function recordIfNew(
  asset: Asset,
  snap: MultiplierSnapshot,
  inForceRaw: string,
  now: number,
): Promise<Outcome<boolean>> {
  // The effective stamp of the value actually in force: a change that has not activated is
  // recorded when it does, not when it is announced.
  const effectiveAt = now >= snap.effectiveAt ? snap.effectiveAt : 0;
  const existing = await db
    .select()
    .from(multipliers)
    .where(and(eq(multipliers.mint, asset.mint), eq(multipliers.effectiveAt, effectiveAt)))
    .limit(1);

  const prior = existing[0];
  if (prior) {
    if (prior.value !== inForceRaw) {
      // The same activation stamp now carries a different value. That is either an issuer
      // republishing history or a corrupt read, and neither is something to silently adopt.
      return held(
        `${asset.symbol}: multiplier at ${effectiveAt} was recorded as ${prior.value} and now reads ${inForceRaw}`,
      );
    }
    return ok(false);
  }

  await db.insert(multipliers).values({
    id: newId("mul"),
    mint: asset.mint,
    value: inForceRaw,
    effectiveAt,
    source: `token-2022 scaled-ui-amount @ ${asset.mint}`,
    seenAt: now,
  });
  return ok(true);
}

/** The most recent multiplier recorded for a mint, or null when we have never seen one. */
export async function lastRecorded(mint: string): Promise<Decimal | null> {
  const rows = await db
    .select()
    .from(multipliers)
    .where(eq(multipliers.mint, mint))
    .orderBy(desc(multipliers.effectiveAt), desc(multipliers.seenAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const d = parseDecimal(row.value);
  return d.ok ? d.value : null;
}

/**
 * Re-express every position in a mint against the live multiplier.
 *
 * Each row is recomputed from its RAW quantity, never from the adjusted one it already
 * carries, so this is idempotent: running it twice, or re-running after a crash, converges
 * instead of compounding. Dollars contributed are never touched — see reconcile.ts for why
 * that is the whole point rather than an omission.
 */
async function reconcilePositions(
  asset: Asset,
  live: Decimal,
  now: number,
): Promise<Outcome<number>> {
  const rows = await db.select().from(positions).where(eq(positions.mint, asset.mint));
  let moved = 0;

  for (const row of rows) {
    const entry = parseDecimal(row.multiplierAtEntry);
    if (!entry.ok) {
      return held(`${asset.symbol}: position ${row.id} carries an unreadable entry multiplier`);
    }
    const before = parseDecimal(formatDecimal(live)); // canonical form for the comparison
    if (!before.ok) return held(`${asset.symbol}: ${before.why}`);

    const r = reconcile(
      {
        qtyRaw: BigInt(row.qtyRaw),
        qtyAdjusted: BigInt(row.qtyAdjusted),
        contributedBase: BigInt(row.costBasisBase),
        multiplierAtEntry: entry.value,
      },
      live,
      entry.value,
    );
    if (!r.ok) return held(`${asset.symbol}: position ${row.id} — ${r.why}`);

    const next = r.value.position.qtyAdjusted;
    if (next === BigInt(row.qtyAdjusted)) continue;

    const safe = toSafeNumber(next, `${asset.symbol} adjusted quantity`);
    if (!safe.ok) return held(`${asset.symbol}: position ${row.id} — ${safe.why}`);

    await db
      .update(positions)
      .set({ qtyAdjusted: safe.value, updatedAt: now })
      .where(eq(positions.id, row.id));
    moved += 1;
  }

  return ok(moved);
}

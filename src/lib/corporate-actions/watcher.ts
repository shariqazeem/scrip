import "server-only";

import { and, desc, eq } from "drizzle-orm";
import type { Connection } from "@solana/web3.js";
import { type Asset, multiplierMints } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { newId, nowSeconds } from "@/lib/db/keys";
import { multipliers } from "@/lib/db/schema";
import { type Decimal, parseDecimal } from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";
import { type MultiplierSnapshot, multiplierInForce } from "./multiplier";
import { type MintRead, readMintMultiplier } from "./read-mint";

/**
 * THE MULTIPLIER WATCHER — records every rebase the issuers publish, so a balance shown as
 * share-equivalents is auditable after the fact and a pending corporate action is visible
 * before it activates.
 *
 * It holds no positions: holdings are read live from the owner's token account whenever a
 * page needs them. What it keeps is the HISTORY, keyed on (mint, effective_at), because a
 * reconciliation nobody can audit afterwards is indistinguishable from one we made up.
 */

export type AssetOutcome = {
  readonly symbol: string;
  readonly mint: string;
  readonly inForce: string | null;
  readonly pending: { readonly value: string; readonly effectiveAt: number } | null;
  readonly paused: boolean;
  readonly recorded: boolean;
  readonly heldWhy: string | null;
};

export type WatchReport = {
  readonly at: number;
  readonly assets: readonly AssetOutcome[];
  readonly anyHeld: boolean;
};

export type MintReader = (asset: Asset, now: number) => Promise<Outcome<MintRead>>;

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
      out.push({ ...blank(asset, null), inForce: "1", paused: read.value.paused });
      continue;
    }
    const resolved = multiplierInForce(read.value.snapshot, now);
    if (!resolved.ok) {
      out.push(blank(asset, resolved.why));
      continue;
    }
    const recorded = await recordIfNew(asset, read.value.snapshot, resolved.value.raw, now);
    out.push({
      symbol: asset.symbol,
      mint: asset.mint,
      inForce: resolved.value.raw,
      pending: resolved.value.pending
        ? { value: resolved.value.pending.raw, effectiveAt: resolved.value.pending.effectiveAt }
        : null,
      paused: read.value.paused,
      recorded: recorded.ok ? recorded.value : false,
      heldWhy: recorded.ok ? null : recorded.why,
    });
  }
  return { at: now, assets: out, anyHeld: out.some((a) => a.heldWhy !== null) };
}

function blank(asset: Asset, why: string | null): AssetOutcome {
  return { symbol: asset.symbol, mint: asset.mint, inForce: null, pending: null, paused: false, recorded: false, heldWhy: why };
}

async function recordIfNew(asset: Asset, snap: MultiplierSnapshot, inForceRaw: string, now: number): Promise<Outcome<boolean>> {
  const effectiveAt = now >= snap.effectiveAt ? snap.effectiveAt : 0;
  const existing = await db
    .select()
    .from(multipliers)
    .where(and(eq(multipliers.mint, asset.mint), eq(multipliers.effectiveAt, effectiveAt)))
    .limit(1);
  const prior = existing[0];
  if (prior) {
    if (prior.value !== inForceRaw) {
      return held(`${asset.symbol}: multiplier at ${effectiveAt} was recorded as ${prior.value} and now reads ${inForceRaw}`);
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

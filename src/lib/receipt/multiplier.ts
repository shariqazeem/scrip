import "server-only";

import type { Asset } from "@/lib/assets/registry";
import { readMintMultiplier } from "@/lib/corporate-actions/read-mint";
import { mainnetConnection } from "@/lib/solana/connection";

/**
 * THE MULTIPLIER IN FORCE AT AN INSTANT — for pricing an old receipt in shares.
 *
 * The mint's scaled-UI config carries the older value, the newer one and the moment the newer
 * takes over, so any instant after the previous change resolves exactly. Held per mint for a
 * minute; a rebase is quarterly.
 */
const HOLD_MS = 60_000;
const g = globalThis as typeof globalThis & { __scripMultiplierAt?: Map<string, { at: number; value: Promise<{ older: string; newer: string; effectiveAt: number } | null> }> };
const cache = (g.__scripMultiplierAt ??= new Map());

export async function multiplierAt(asset: Asset, unix: number): Promise<string | null> {
  if (!asset.powers.hasMultiplier) return null;
  const hit = cache.get(asset.mint);
  let value = hit && Date.now() - hit.at < HOLD_MS ? hit.value : null;
  if (!value) {
    value = readMintMultiplier(mainnetConnection(), asset, Math.floor(Date.now() / 1000))
      .then((r) => (r.ok && r.value.kind === "scaled" ? { older: r.value.snapshot.multiplier, newer: r.value.snapshot.newMultiplier, effectiveAt: r.value.snapshot.effectiveAt } : null))
      .catch(() => null);
    cache.set(asset.mint, { at: Date.now(), value });
  }
  const snap = await value;
  if (!snap) return null;
  return unix >= snap.effectiveAt ? snap.newer : snap.older;
}

import { type Decimal, cmpDecimal, formatDecimal, parseDecimal, ratio } from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * WHICH MULTIPLIER IS LIVE RIGHT NOW — and it is not the field called `multiplier`.
 *
 * A Token-2022 ScaledUiAmount config carries TWO values and a timestamp:
 *
 *     multiplier                        the older value
 *     newMultiplier                     the newer value
 *     newMultiplierEffectiveTimestamp   when the newer one takes over
 *
 * Read on mainnet, 2026-09-12, the SPYx mint held:
 *
 *     multiplier   1.003909240011759
 *     new          1.005714560286254
 *     effective    1781755200  =  2026-06-18T04:00:00Z
 *
 * That timestamp is three months in the PAST, so the live multiplier is `newMultiplier` and
 * the field named `multiplier` is a stale value the extension simply keeps. An app that
 * reads the obvious field paints every SPYx balance 0.18% short, forever, and nothing about
 * the reading looks wrong. This is the corporate-action bug in its quietest form: not a
 * crash, not a missing feed — a plausible number from the wrong field.
 *
 * TWO FACTUAL CORRECTIONS TO THE SPEC, both from reading the mint rather than the docs:
 *
 *   1. `docs/research.md` says activation happens at 00:30 UTC the day after publication. The
 *      one activation actually observed on chain is 04:00:00 UTC. Nothing here hardcodes an
 *      activation hour — the timestamp on the mint is the only authority, and a boundary we
 *      cannot verify would be an invented fact doing real work.
 *   2. Both values are published BEFORE the change activates, so a pending corporate action
 *      is visible in advance. That is what `pending` below exposes, and it is why a snapshot
 *      taken before an activation still values correctly through it.
 */

/** Exactly what a mint's ScaledUiAmount extension carries, plus when we observed it. */
export type MultiplierSnapshot = {
  readonly mint: string;
  /** The older value, as published. Never a float. */
  readonly multiplier: string;
  readonly newMultiplier: string;
  /** Unix seconds at which `newMultiplier` takes over. */
  readonly effectiveAt: number;
  /** Unix seconds at which WE read this. Distinct from effectiveAt, and confusing the two
   *  reconciles a day early. */
  readonly seenAt: number;
};

export type InForce = {
  /** The multiplier that is live at the given instant. The only one a balance may use. */
  readonly value: Decimal;
  /** Its canonical string, for storage and for a receipt. */
  readonly raw: string;
  /** A published change that has not activated yet, or null. */
  readonly pending: { readonly value: Decimal; readonly raw: string; readonly effectiveAt: number } | null;
};

/**
 * A snapshot older than this holds rather than being used.
 *
 * The risk is not that the snapshot decays — both values are published in advance, so an old
 * snapshot values correctly through the activation it already knows about. The risk is a
 * change published AFTER we looked, which we would have no way to see. One hour is far
 * shorter than the quarterly cadence of a real corporate action and far longer than the
 * watcher's polling interval, so in normal operation this never fires; when it does, the
 * watcher is dead or the RPC is down, and that is exactly when a balance should hold instead
 * of being painted from memory.
 */
export const MAX_SNAPSHOT_AGE_SECONDS = 3600;

/**
 * The widest single step this code will accept without a human looking at it.
 *
 * A 4-for-1 split is 4x. A 1-for-10 reverse split is 0.1x. A reinvested dividend is a
 * fraction of a percent. Nothing real is outside [1/50, 50], so a value outside it is a
 * corrupt read — and a corrupt read must never be allowed to rewrite every balance on the
 * book. It holds and says what it saw.
 */
export const SANITY_MIN = "0.02";
export const SANITY_MAX = "50";

/**
 * Resolve the live multiplier for an instant.
 *
 * `now` is injectable rather than read from the clock, because every corporate-action bug is
 * a disagreement about what time it is, and a function that cannot be asked about a specific
 * instant cannot be tested for one.
 */
export function multiplierInForce(
  snap: MultiplierSnapshot,
  now: number,
  maxAgeSeconds: number = MAX_SNAPSHOT_AGE_SECONDS,
): Outcome<InForce> {
  const older = parseDecimal(snap.multiplier);
  if (!older.ok) return held(`${snap.mint}: ${older.why}`);
  const newer = parseDecimal(snap.newMultiplier);
  if (!newer.ok) return held(`${snap.mint}: ${newer.why}`);

  // A zero multiplier would zero every balance holding this mint. That is not a number to
  // compute with, it is a reading to refuse.
  if (older.value.units === 0n || newer.value.units === 0n) {
    return held(`${snap.mint}: multiplier is zero — refusing to zero a balance on one read`);
  }

  if (!Number.isFinite(snap.seenAt) || !Number.isFinite(snap.effectiveAt)) {
    return held(`${snap.mint}: multiplier snapshot carries a non-finite timestamp`);
  }
  if (now < snap.seenAt) {
    // Reasoning forward from a snapshot taken in the future is guessing with extra steps.
    return held(`${snap.mint}: multiplier snapshot is dated in the future`);
  }
  const age = now - snap.seenAt;
  if (age > maxAgeSeconds) {
    return held(
      `${snap.mint}: multiplier was last read ${Math.floor(age / 60)} minutes ago — too old to value a balance`,
    );
  }

  const step = ratio(newer.value, older.value);
  if (!step.ok) return held(`${snap.mint}: ${step.why}`);
  const min = parseDecimal(SANITY_MIN);
  const max = parseDecimal(SANITY_MAX);
  if (!min.ok || !max.ok) return held("sanity band is misconfigured");
  if (cmpDecimal(step.value, min.value) < 0 || cmpDecimal(step.value, max.value) > 0) {
    return held(
      `${snap.mint}: multiplier step ${snap.multiplier} → ${snap.newMultiplier} is outside anything a real corporate action does`,
    );
  }

  // THE RULE. The timestamp on the mint decides, and nothing else does.
  const activated = now >= snap.effectiveAt;
  const live = activated ? newer.value : older.value;
  const pending =
    !activated && cmpDecimal(newer.value, older.value) !== 0
      ? {
          value: newer.value,
          raw: formatDecimal(newer.value),
          effectiveAt: snap.effectiveAt,
        }
      : null;

  return ok({ value: live, raw: formatDecimal(live), pending });
}

/** A mint with no ScaledUiAmount extension is a multiplier of exactly one, forever. */
export function noMultiplier(): InForce {
  return { value: { units: 1n, scale: 0 }, raw: "1", pending: null };
}

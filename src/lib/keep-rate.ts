import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * KEEP-RATE AT THIRTY DAYS — the share of released value still held.
 *
 * It is the whole difference between a payout and a farm, and it is the one number nobody
 * else in this category will have, because having it requires a decision made BEFORE the
 * first payout rather than after: the cohort is stamped by the program at release, in the
 * same instruction that moved the value.
 *
 * WHY IT CANNOT BE FAKED, stated precisely, because the claim is worth nothing if it is
 * hand-waved:
 *
 *   · the DENOMINATOR is stamped on chain, by the program, at the instant value moved. It is
 *     not recomputed, re-priced, or chosen later. Anyone can read it from the receipt account.
 *   · the NUMERATOR is the recipient's balance now, read from their own token accounts, which
 *     are public.
 *   · both ends are therefore reproducible by a stranger with an RPC endpoint and this file.
 *
 * A cohort reconstructed after the fact would be a balance measured against a number somebody
 * chose afterwards, and would tell you nothing. That is exactly why `release_payout` writes
 * the Cohort account rather than an analytics job writing it on Monday.
 */

export const KEEP_RATE_WINDOW_DAYS = 30;
const DAY = 86_400;

export type CohortRow = {
  readonly recipient: string;
  readonly releaseId: string;
  /** What the program stamped at release, 6-decimal base units. Never recomputed. */
  readonly valueAtReleaseBase: bigint;
  readonly releasedAt: number;
  /** What the recipient held when we last measured, or null if never measured. */
  readonly valueNowBase: bigint | null;
  readonly measuredAt: number | null;
};

export type KeepRate = {
  /** Basis points of released value still held. 10,000 is everything. */
  readonly bps: number;
  /** Cohorts old enough to count. */
  readonly cohorts: number;
  readonly releasedBase: bigint;
  readonly heldBase: bigint;
  /** The window this covers, so a figure is never quoted without the period it is over. */
  readonly windowDays: number;
};

/** Cohorts that have matured: released at least the window ago. */
export function matured(rows: readonly CohortRow[], now: number, windowDays = KEEP_RATE_WINDOW_DAYS) {
  const cutoff = now - windowDays * DAY;
  return rows.filter((r) => r.releasedAt <= cutoff);
}

/**
 * Compute keep-rate over the cohorts that have matured AND been measured.
 *
 * A cohort that matured but was never measured is EXCLUDED and counted in the hold, not
 * treated as a zero. Those are opposite claims — "they spent it all" and "we did not look" —
 * and quietly conflating them is how a growth metric becomes a lie in the safest possible
 * direction for whoever is quoting it.
 */
export function keepRate(
  rows: readonly CohortRow[],
  now: number,
  windowDays = KEEP_RATE_WINDOW_DAYS,
): Outcome<KeepRate> {
  const ready = matured(rows, now, windowDays);
  if (ready.length === 0) {
    return held(
      `No payout is ${windowDays} days old yet, so there is no keep-rate to report. This figure appears once one is.`,
    );
  }
  const measured = ready.filter((r) => r.valueNowBase !== null);
  if (measured.length === 0) {
    return held(
      `${ready.length} payout${ready.length === 1 ? " has" : "s have"} matured but none has been measured yet.`,
    );
  }
  if (measured.length < ready.length) {
    return held(
      `${ready.length - measured.length} of ${ready.length} matured payouts have not been measured, so a keep-rate now would be measured over a cohort we only partly looked at.`,
    );
  }

  const releasedBase = measured.reduce((n, r) => n + r.valueAtReleaseBase, 0n);
  if (releasedBase <= 0n) return held("These cohorts were released with no value in them.");
  const heldBase = measured.reduce((n, r) => n + (r.valueNowBase ?? 0n), 0n);

  return ok({
    // Deliberately NOT capped at 10,000. If gold rises, a recipient who spent nothing can hold
    // more than they were given, and a keep-rate above 100% is the true reading. Clamping it
    // would hide the asset doing exactly what the product says it does.
    bps: Number((heldBase * 10_000n) / releasedBase),
    cohorts: measured.length,
    releasedBase,
    heldBase,
    windowDays,
  });
}

/** Cohorts due a measurement: matured, and either never measured or measured before maturity. */
export function dueForMeasurement(
  rows: readonly CohortRow[],
  now: number,
  windowDays = KEEP_RATE_WINDOW_DAYS,
): readonly CohortRow[] {
  const cutoff = now - windowDays * DAY;
  return matured(rows, now, windowDays).filter(
    (r) => r.measuredAt === null || r.measuredAt < cutoff,
  );
}

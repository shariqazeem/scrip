import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";
import { loadBook } from "@/lib/book/read-book";
import { type CohortRow, dueForMeasurement } from "@/lib/keep-rate";
import { toSafeNumber } from "@/lib/money";
import { type Outcome, ok } from "@/lib/outcome";

/**
 * THE MEASUREMENT PASS — the numerator of keep-rate.
 *
 * The denominator was stamped on chain by the program when value moved, and is never touched
 * again. This reads the other end: what the recipient holds NOW, from their own public token
 * accounts, through the current issuer multipliers and today's prices.
 *
 * A cohort it cannot measure is LEFT UNMEASURED. Writing a zero would say "they spent it all"
 * when what happened was "we could not look", and those are opposite claims. `keepRate` then
 * refuses to report a figure at all rather than averaging over a cohort it only partly saw.
 */

export type MeasureReport = {
  readonly due: number;
  readonly measured: number;
  readonly holds: readonly string[];
};

export async function measureCohorts(
  now: number = Math.floor(Date.now() / 1000),
  limit = 25,
): Promise<Outcome<MeasureReport>> {
  const rows = await db.select().from(cohorts);
  const asCohorts: CohortRow[] = rows.map((c) => ({
    recipient: c.recipient,
    releaseId: c.releaseId,
    valueAtReleaseBase: BigInt(c.valueAtReleaseBase),
    releasedAt: c.releasedAt,
    valueNowBase: c.valueNowBase === null ? null : BigInt(c.valueNowBase),
    measuredAt: c.measuredAt,
  }));

  const due = dueForMeasurement(asCohorts, now);
  const holds: string[] = [];
  let measured = 0;

  // One recipient can appear in several cohorts; their book is read once and reused, because
  // reading it per row would be the same RPC call four times for the same answer.
  const byRecipient = new Map<string, bigint | null>();

  for (const cohort of due.slice(0, limit)) {
    if (!byRecipient.has(cohort.recipient)) {
      const book = await loadBook(cohort.recipient, now);
      byRecipient.set(cohort.recipient, book.ok ? book.value.value.valueBase : null);
      if (!book.ok) holds.push(`${cohort.recipient.slice(0, 8)}…: ${book.why}`);
      else if (book.value.holds.length > 0) {
        // A book we could only partly read is not a measurement. Held, not written.
        byRecipient.set(cohort.recipient, null);
        holds.push(
          `${cohort.recipient.slice(0, 8)}…: part of this book could not be read, so it was not measured.`,
        );
      }
    }
    const value = byRecipient.get(cohort.recipient);
    if (value === null || value === undefined) continue;

    const safe = toSafeNumber(value, "held value");
    if (!safe.ok) {
      holds.push(`${cohort.recipient.slice(0, 8)}…: ${safe.why}`);
      continue;
    }

    await db
      .update(cohorts)
      .set({ valueNowBase: safe.value, measuredAt: now })
      .where(eq(cohorts.releaseId, cohort.releaseId));
    measured += 1;
  }

  return ok({ due: due.length, measured, holds: [...new Set(holds)] });
}

import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * KEEP-RATE — the share of what was converted that is still held, measured on chain.
 *
 * Recorded at settlement, measured at 7 and 30 days by anyone who calls `measure_receipt`,
 * computed from RAW units so a rebase never looks like a sale. Per recipient, over the
 * receipts whose window has been measured:
 *
 *     held      = min( balance_raw_at_measure , Σ amount_raw over those receipts )
 *     keep-rate = Σ held × price_at_settle  /  Σ amount_raw × price_at_settle
 *
 * where `price_at_settle` is `paid_usdc ÷ amount_raw` on the receipt — so a receipt's own
 * dollars weight it, and the ratio is dimensionless.
 *
 * WHY IT CANNOT BE FAKED. The denominator is the receipt's own `amount_raw`, written by the
 * program when the tokens landed. The numerator is a balance the program read from the
 * recipient's own token account, on a date anyone can check. Neither is ours to choose.
 *
 * A window that has not matured is not a zero, and a receipt that matured but was never
 * measured is EXCLUDED and reported, never counted as spent. "They sold it" and "nobody
 * looked" are opposite claims.
 */

export const WINDOWS = [7, 30] as const;
export type Window = (typeof WINDOWS)[number];
const DAY = 86_400;

export type ReceiptRow = {
  readonly recipient: string;
  readonly asset: string;
  readonly settledUnix: number;
  readonly paidUsdc: bigint;
  readonly amountRaw: bigint;
  /** null = not measured; a balance in raw units otherwise. */
  readonly measured7dRaw: bigint | null;
  readonly measured30dRaw: bigint | null;
};

export type KeepRate = {
  readonly windowDays: Window;
  /** Basis points still held. May exceed 10,000 only in theory; capped by min() per recipient. */
  readonly bps: number;
  readonly receipts: number;
  readonly recipients: number;
  readonly paidUsdc: bigint;
  readonly heldUsdc: bigint;
};

function measured(r: ReceiptRow, w: Window): bigint | null {
  return w === 7 ? r.measured7dRaw : r.measured30dRaw;
}

/** Receipts old enough for the window. */
export function matured(rows: readonly ReceiptRow[], windowDays: Window, now: number): ReceiptRow[] {
  return rows.filter((r) => now >= r.settledUnix + windowDays * DAY);
}

/** Receipts old enough and not yet measured — what the crank should call `measure_receipt` on. */
export function dueForMeasurement(rows: readonly ReceiptRow[], windowDays: Window, now: number): ReceiptRow[] {
  return matured(rows, windowDays, now).filter((r) => measured(r, windowDays) === null);
}

export function keepRate(rows: readonly ReceiptRow[], windowDays: Window, now: number): Outcome<KeepRate> {
  const ready = matured(rows, windowDays, now);
  if (ready.length === 0) {
    return held(`No receipt is ${windowDays} days old yet. This figure appears once one is.`);
  }
  const done = ready.filter((r) => measured(r, windowDays) !== null);
  if (done.length === 0) {
    return held(`${ready.length} receipt${ready.length === 1 ? " is" : "s are"} old enough but none has been measured yet.`);
  }
  if (done.length < ready.length) {
    return held(
      `${ready.length - done.length} of ${ready.length} matured receipts have not been measured, so a keep-rate now would be over a cohort only partly looked at.`,
    );
  }

  // Group by (recipient, asset): a person's balance is one number that has to cover every
  // receipt they have in that asset, so the cap applies to the group, never per receipt.
  type Group = { rows: ReceiptRow[]; balance: bigint };
  const groups = new Map<string, Group>();
  for (const r of done) {
    const key = `${r.recipient}:${r.asset}`;
    const g = groups.get(key) ?? { rows: [], balance: measured(r, windowDays)! };
    g.rows.push(r);
    // Measurements of the same balance at different receipts' 7-day marks can differ; the
    // LATEST measurement is the truest reading of what they hold now.
    const m = measured(r, windowDays)!;
    if (m < g.balance) g.balance = m;
    groups.set(key, g);
  }

  // Weights: dollars paid, scaled to 1e6 precision so the sums stay integers.
  let paid = 0n;
  let heldValue = 0n;
  for (const g of groups.values()) {
    const totalRaw = g.rows.reduce((n, r) => n + r.amountRaw, 0n);
    const totalPaid = g.rows.reduce((n, r) => n + r.paidUsdc, 0n);
    if (totalRaw === 0n) continue;
    const heldRaw = g.balance < totalRaw ? g.balance : totalRaw;
    // held × (paid / totalRaw) = held-in-dollars at the settle price.
    heldValue += (heldRaw * totalPaid) / totalRaw;
    paid += totalPaid;
  }
  if (paid <= 0n) return held("These receipts carry no value.");

  return ok({
    windowDays,
    bps: Number((heldValue * 10_000n) / paid),
    receipts: done.length,
    recipients: new Set(done.map((r) => r.recipient)).size,
    paidUsdc: paid,
    heldUsdc: heldValue,
  });
}

/** The first date on which a keep-rate for this window can exist, or null if it already can. */
export function firstMaturity(rows: readonly ReceiptRow[], windowDays: Window, now: number): number | null {
  const earliest = rows.reduce<number | null>((m, r) => (m === null || r.settledUnix < m ? r.settledUnix : m), null);
  if (earliest === null) return null;
  const at = earliest + windowDays * DAY;
  return at > now ? at : null;
}

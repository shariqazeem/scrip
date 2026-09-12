import {
  type Decimal,
  cmpDecimal,
  formatDecimal,
  mulBase,
  ratio,
  valueOfQty,
} from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * THE ACCOUNTING THAT SURVIVES A CORPORATE ACTION.
 *
 * Two rules, and everything else follows from them:
 *
 *   1. ADJUSTED QUANTITY IS ALWAYS RECOMPUTED FROM RAW.
 *        adjusted = raw × multiplier-in-force
 *      Never from the previously adjusted quantity. Raw is what the chain holds and a
 *      corporate action does not change it; the multiplier is what changed. Recomputing from
 *      raw means a chain of ten reconciliations has exactly one truncation in it, and means a
 *      reconciliation is idempotent — running it twice cannot move a balance.
 *
 *   2. A MULTIPLIER CHANGE NEVER MOVES COST BASIS.
 *      Basis here is DOLLARS CONTRIBUTED FROM OUTSIDE: what a payout, a gift or a sponsor
 *      actually put in. A split brings in no dollars. A reinvested dividend brings in no
 *      dollars either — it converts value the position already held into more units of the
 *      same thing. So neither touches basis, and both leave the return exactly where it was.
 *
 * WHY NOT THE DRIP CONVENTION. Standard dividend-reinvestment accounting adds the reinvested
 * amount to basis. Applied here it would make a reinvested dividend render as a LOSS of
 * exactly the dividend — the mirror image of the bug we are avoiding, and a worse one,
 * because a savings product that shows you losing money on the day you earned some has
 * nothing left to explain it with. Contributed-dollars basis makes both the dividend and the
 * split come out at zero on the day, and lets the dividend show up as return later, when the
 * price recovers, which is when it actually was one.
 *
 * The two failures this makes impossible, which are the two the build order names:
 *
 *   a dividend is not a gain      — value before ≡ value after; basis untouched
 *   a 4-for-1 split is not 300%   — quantity ×4, price ÷4, value flat, basis untouched
 *
 * The naive version of both is the same mistake: comparing a quantity read at TODAY's
 * multiplier against a per-unit basis recorded at an OLDER one.
 */

export type Position = {
  /** Token base units as the chain holds them. A corporate action never changes this. */
  readonly qtyRaw: bigint;
  /** raw × multiplier. The only quantity a screen may render. */
  readonly qtyAdjusted: bigint;
  /** Dollars contributed from outside, 6-decimal base units. */
  readonly contributedBase: bigint;
  /** The multiplier in force when this position was opened. */
  readonly multiplierAtEntry: Decimal;
};

export type Reconciliation = {
  readonly position: Position;
  /** The multiplier we moved from and to. */
  readonly from: string;
  readonly to: string;
  /** Change in adjusted quantity, in token base units. Positive on a dividend or a split. */
  readonly qtyDelta: bigint;
  /** True when nothing moved — the common case, and not worth a receipt. */
  readonly unchanged: boolean;
  /** A sentence for the receipt. Says what happened without claiming why. */
  readonly note: string;
};

/**
 * Re-express a position against a new multiplier.
 *
 * It deliberately does NOT take the kind of corporate action. It does not need one: the
 * arithmetic is identical for a split, a reinvested dividend and a reverse split, so asking
 * an issuer feed to classify the event — and holding when it cannot — would be a dependency
 * bought for nothing. The label belongs on the receipt, where a human reads it; the money
 * does not depend on it.
 */
export function reconcile(pos: Position, to: Decimal, from: Decimal): Outcome<Reconciliation> {
  if (pos.qtyRaw < 0n) return held("a position cannot hold a negative raw quantity");
  if (to.units <= 0n) return held("refusing to reconcile against a non-positive multiplier");

  const qtyAdjusted = mulBase(pos.qtyRaw, to);
  const qtyDelta = qtyAdjusted - pos.qtyAdjusted;
  const unchanged = cmpDecimal(from, to) === 0 && qtyDelta === 0n;

  const step = ratio(to, from);
  const stepNote = step.ok ? ` (×${formatDecimal(step.value).slice(0, 12)})` : "";

  return ok({
    position: {
      qtyRaw: pos.qtyRaw,
      qtyAdjusted,
      // RULE 2. Untouched, on purpose, and the one line most likely to be "fixed" by someone
      // who has not read the comment above.
      contributedBase: pos.contributedBase,
      multiplierAtEntry: pos.multiplierAtEntry,
    },
    from: formatDecimal(from),
    to: formatDecimal(to),
    qtyDelta,
    unchanged,
    note: unchanged
      ? `Multiplier unchanged at ${formatDecimal(to)}.`
      : `Multiplier ${formatDecimal(from)} → ${formatDecimal(to)}${stepNote}. ` +
        `Adjusted quantity re-expressed; dollars contributed unchanged.`,
  });
}

/** The position's value in 6-decimal USD, from the ADJUSTED quantity and never the raw one. */
export function positionValue(pos: Position, decimals: number, priceBase: bigint): bigint {
  return valueOfQty(pos.qtyAdjusted, decimals, priceBase);
}

/**
 * How much of the position's quantity arrived through corporate actions rather than through
 * a contribution — `raw × (now − at-entry)`.
 *
 * This is the honest decomposition the adjusted model buys us, and it is the number worth
 * showing a holder: "0.0183 of your shares arrived as reinvested dividends" is true, checkable
 * against the mint, and is the thing a raw-balance product cannot say at all.
 */
export function quantityFromCorporateActions(pos: Position, now: Decimal): bigint {
  return mulBase(pos.qtyRaw, now) - mulBase(pos.qtyRaw, pos.multiplierAtEntry);
}

import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * THE SLICE — how much of an inflow becomes the asset. A mirror of `compute_slice` and
 * `effective_rate` in `anchor/programs/scrip/src/rule.rs`.
 *
 * It exists so the keeper can decide whether a sweep is worth submitting, and so a screen
 * can say "the next $500 becomes $50" before anything is signed. That makes it a SECOND COPY
 * of a money rule, which is the defect shape this codebase is built to avoid, so
 * `slice.test.ts` reads the Rust file's constants and fails if these stop matching.
 *
 * THE RULE SEES THE NET INCREASE since the last sweep, never gross inbound. If the balance
 * fell, the watermark follows it down and nothing converts: spending is not income.
 */

/** Mirrors `MAX_RATE_BPS`. Half. */
export const MAX_RATE_BPS = 5_000;
/** Mirrors `ESCALATION_PERIOD`. Ninety days. */
export const ESCALATION_PERIOD_SECONDS = 90 * 86_400;
/** Mirrors `MIN_SLICE`. $0.50. */
export const MIN_SLICE = 500_000n;
/** Mirrors `DEFAULT_MIN_INBOUND`. $1. */
export const DEFAULT_MIN_INBOUND = 1_000_000n;
export const MIN_TOLERANCE_BPS = 50;
export const MAX_TOLERANCE_BPS = 300;
/** Mirrors `FEED_MAX_AGE`. Ten minutes. */
export const FEED_MAX_AGE_SECONDS = 600;
/** Mirrors `MAX_CONF_BPS`. 1%. */
export const MAX_CONF_BPS = 100;
export const TOTAL_BPS = 10_000;

/** The product's presets and default, in basis points. */
export const RATE_PRESETS_BPS = [500, 1_000, 2_000] as const;
export const DEFAULT_RATE_BPS = 1_000;
/** "Add 1% every three months." */
export const DEFAULT_ESCALATION_BPS = 100;
/** The cap's default: $5,000 per inflow. */
export const DEFAULT_CAP_USDC = 5_000_000_000n;
export const DEFAULT_TOLERANCE_BPS = 100;
/** The delegate allowance's default: $1,000. */
export const DEFAULT_ALLOWANCE_USDC = 1_000_000_000n;
/** The float's suggested deposit, in lamports. About fourteen sweeps. */
/**
 * WHAT A SWEEP COSTS THE FLOAT, measured on mainnet on 2026-09-21.
 *
 * `begin_sweep` requires the Book to hold `tip + receipt rent + ata rent` above its own
 * rent, and repays the keeper exactly that. The FIRST sweep is dearer because it creates
 * the owner's asset account; every one after it does not.
 *
 *   KEEPER_TIP        500,000
 *   receipt rent    2,519,680   368 bytes at 5,080 a byte
 *   SPYx ATA rent   1,559,560   179 bytes, token-2022
 *
 * One constant of 3,400,000 was wrong in both directions: it overstated a later sweep by
 * 380,320, and understated the first by 1,179,240 — so a float sized for "one sweep" bought
 * a rule that could never fire, reported only as `float-empty`.
 */
export const SWEEP_COST_LAMPORTS = 3_019_680n;
export const FIRST_SWEEP_LAMPORTS = 4_579_240n;
/**
 * What a new register is offered. Covers the first sweep and five more — enough that the
 * rule visibly works — at about a third of the old 0.05, because the float is the largest
 * part of the entry price and the one part a person cannot reason about.
 */
export const SUGGESTED_FLOAT_LAMPORTS = 20_000_000n;

export type RuleTerms = {
  readonly rateBps: number;
  readonly escalateBps: number;
  readonly floorUsdc: bigint;
  readonly capUsdc: bigint;
  readonly toleranceBps: number;
};

/** Mirrors `check_rule_ranges`. Every rule names the on-chain error it mirrors. */
export function validateRule(t: RuleTerms): Outcome<RuleTerms> {
  if (!Number.isInteger(t.rateBps) || t.rateBps < 1 || t.rateBps > MAX_RATE_BPS) {
    return held(`The rate must be between 0.01% and ${MAX_RATE_BPS / 100}%.`); // RateOutOfRange
  }
  if (!Number.isInteger(t.escalateBps) || t.escalateBps < 0 || t.escalateBps > MAX_RATE_BPS) {
    return held(`Escalation must be between 0 and ${MAX_RATE_BPS / 100}%.`); // EscalationOutOfRange
  }
  if (
    !Number.isInteger(t.toleranceBps) ||
    t.toleranceBps < MIN_TOLERANCE_BPS ||
    t.toleranceBps > MAX_TOLERANCE_BPS
  ) {
    return held(`The tolerance must be between ${MIN_TOLERANCE_BPS / 100}% and ${MAX_TOLERANCE_BPS / 100}%.`); // ToleranceOutOfRange
  }
  if (t.floorUsdc < 0n || t.capUsdc < 0n) return held("A floor or a cap cannot be negative.");
  return ok(t);
}

/** Mirrors `effective_rate`: one escalation step per full period, capped at the ceiling. */
export function effectiveRate(rateBps: number, escalateBps: number, enabledUnix: number, now: number): number {
  if (escalateBps === 0 || now <= enabledUnix) return rateBps;
  const periods = Math.floor((now - enabledUnix) / ESCALATION_PERIOD_SECONDS);
  return Math.min(MAX_RATE_BPS, rateBps + escalateBps * periods);
}

export type SliceInput = {
  /** The owner's USDC balance, 6-decimal base units. */
  readonly balance: bigint;
  readonly watermark: bigint;
  readonly minInbound: bigint;
  readonly cap: bigint;
  readonly floor: bigint;
  readonly rateBps: number;
};

export type Slice = {
  readonly inbound: bigint;
  readonly taxable: bigint;
  readonly slice: bigint;
  /** What the watermark becomes after the sweep: balance − slice. */
  readonly watermarkAfter: bigint;
};

/** Mirrors `compute_slice`. Holds with the on-chain error's meaning when nothing would move. */
export function computeSlice(i: SliceInput): Outcome<Slice> {
  const watermark = i.watermark < i.balance ? i.watermark : i.balance;
  const inbound = i.balance - watermark;
  if (inbound < i.minInbound) {
    return held("The net inflow is below the rule's minimum."); // InboundBelowMinimum
  }
  const taxable = i.cap > 0n && inbound > i.cap ? i.cap : inbound;
  let slice = (taxable * BigInt(i.rateBps)) / BigInt(TOTAL_BPS);
  if (i.floor > 0n) {
    const room = i.balance > i.floor ? i.balance - i.floor : 0n;
    if (slice > room) slice = room;
  }
  if (slice < MIN_SLICE) {
    return held("The slice would be below the $0.50 minimum."); // SliceBelowMinimum
  }
  return ok({ inbound, taxable, slice, watermarkAfter: i.balance - slice });
}

/**
 * A worked example for a screen: what a given arrival would become under these terms, at
 * the rate in force now. Pure, so a rule page can show it before anything is signed.
 */
export function preview(arrivalUsdc: bigint, terms: RuleTerms, balance = 0n): Outcome<Slice> {
  return computeSlice({
    balance: balance + arrivalUsdc,
    watermark: balance,
    minInbound: DEFAULT_MIN_INBOUND,
    cap: terms.capUsdc,
    floor: terms.floorUsdc,
    rateBps: terms.rateBps,
  });
}

/**
 * How many sweeps a float pays for. `firstDone` is true once the owner's asset account
 * exists, because that is the only thing that makes the first sweep dearer than the rest.
 * Rounds down, and never claims one it cannot cover.
 */
export function sweepsCovered(lamports: bigint, firstDone = false): number {
  if (lamports <= 0n) return 0;
  if (firstDone) return Number(lamports / SWEEP_COST_LAMPORTS);
  if (lamports < FIRST_SWEEP_LAMPORTS) return 0;
  return 1 + Number((lamports - FIRST_SWEEP_LAMPORTS) / SWEEP_COST_LAMPORTS);
}

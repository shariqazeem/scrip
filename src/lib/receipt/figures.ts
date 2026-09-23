/**
 * WHAT A RECEIPT ACTUALLY DID — three figures a stranger can check against the chain.
 *
 *   FILL      what the slice paid per unit, against the Pyth price `finish_sweep` checked.
 *             The paid USDC, the raw units delivered and the price stamp are all on the
 *             receipt. The one outside input is the mint's scaled-UI multiplier, when the
 *             stamp priced a SHARE (the underlying) rather than the token: raw × multiplier
 *             is shares. Display arithmetic; the program's own check is the min-out.
 *   SECONDS   from the last attributed arrival's block to the receipt's settlement.
 *   COST      what the sweep took from the register's float, split the way `finish_sweep`
 *             pays it: the receipt's rent, the keeper's tip, and — on a first sweep — the
 *             rent for the owner's new asset account.
 */

/** The fixed tip `finish_sweep` and `vest` pay the submitter. Mirrors `KEEPER_TIP` in lib.rs. */
export const KEEPER_TIP_LAMPORTS = 500_000;

export type Fill = {
  readonly perUnitUsd: number;
  readonly pythUsd: number;
  /** Positive: paid more per unit than Pyth's price. Negative: paid less. */
  readonly deviationBps: number;
};

export function fillVsPyth(input: {
  readonly paidUsdc: bigint;
  readonly amountRaw: bigint;
  readonly decimals: number;
  readonly price: bigint;
  readonly expo: number;
  /** Decimal string when the stamp priced a share; null when it priced the token itself. */
  readonly multiplier: string | null;
}): Fill | null {
  if (input.amountRaw <= 0n || input.price <= 0n || input.paidUsdc <= 0n) return null;
  const tokens = Number(input.amountRaw) / 10 ** input.decimals;
  const units = input.multiplier === null ? tokens : tokens * Number(input.multiplier);
  if (!Number.isFinite(units) || units <= 0) return null;
  const perUnitUsd = Number(input.paidUsdc) / 1e6 / units;
  const pythUsd = Number(input.price) * 10 ** input.expo;
  if (!(pythUsd > 0)) return null;
  return { perUnitUsd, pythUsd, deviationBps: ((perUnitUsd - pythUsd) / pythUsd) * 10_000 };
}

/** "0.04% above Pyth", "0.12% below Pyth", "at Pyth" — two decimals, never a rounded zero. */
export function describeDeviation(bps: number): string {
  const pct = Math.abs(bps) / 100;
  if (pct < 0.005) return "at Pyth’s price";
  return `${pct.toFixed(2)}% ${bps > 0 ? "above" : "below"} Pyth`;
}

/**
 * Seconds from the money landing to the stock arriving. Null when there is no arrival time,
 * or when the gap is not a sweep answering an arrival (negative, or longer than six hours —
 * an attribution reaching back past an earlier sweep says nothing about this one's speed).
 */
export function landedToStock(settledUnix: number, arrivals: ReadonlyArray<number | null | undefined>): number | null {
  const times = arrivals.filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (times.length === 0) return null;
  const gap = settledUnix - Math.max(...times);
  return gap >= 0 && gap <= 6 * 3600 ? gap : null;
}

export function describeSeconds(s: number): string {
  if (s < 90) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

export type Cost = {
  readonly totalLamports: number;
  readonly rentLamports: number;
  readonly tipLamports: number;
  /** Rent for the owner's new asset account, advanced by the keeper on a first sweep. */
  readonly accountLamports: number;
};

/**
 * Split what left the float. `spent` is the float's own balance change in the receipt's
 * transaction; `rent` is the receipt account's lamports. Null when the numbers do not add up
 * to what `finish_sweep` pays — better no figure than a wrong one.
 */
export function splitCost(spent: number | null, rent: number): Cost | null {
  if (spent === null || spent <= 0 || rent <= 0) return null;
  const rest = spent - rent;
  if (rest < KEEPER_TIP_LAMPORTS) return null;
  return { totalLamports: spent, rentLamports: rent, tipLamports: KEEPER_TIP_LAMPORTS, accountLamports: rest - KEEPER_TIP_LAMPORTS };
}

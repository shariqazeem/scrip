import { type Outcome, held, ok } from "./outcome";

/**
 * EXACT ARITHMETIC FOR THINGS THAT ARE SOMEONE'S MONEY.
 *
 * Nothing in this file uses a float. An issuer publishes a multiplier as `1.003909240011759`
 * — sixteen significant digits, which is already at the edge of what an IEEE double holds
 * exactly. Multiply a balance by that as a `number` and the error is invisible on one
 * position and a cent a day across a book, drifting in a direction nobody chose.
 *
 * So: quantities and values are `bigint` base units, and a multiplier is an exact
 * (units, scale) pair. Every product is computed in integers and truncated ONCE, at the end.
 *
 * TWO UNITS, NEVER INTERCHANGEABLE:
 *   base   — USD value in 6-decimal units, the USDC convention. $1.50 = 1_500_000n.
 *   qty    — token quantity in THAT MINT's base units. The decimals come from the asset
 *            registry, never from a default: reading an 8-decimal equity as 6-decimal USDC
 *            is a 100x error in a balance.
 */

/** An exact non-negative decimal: value = units / 10^scale. */
export type Decimal = { readonly units: bigint; readonly scale: number };

/** USD values are carried in 6-decimal base units throughout the product. */
export const USD_DECIMALS = 6;

export const ONE: Decimal = { units: 1n, scale: 0 };

/**
 * A multiplier with more than this many fractional digits is rejected rather than rounded.
 * The observed issuer precision is 15 (`1.003909240011759` on SPYx, mainnet, 2026-09-12);
 * 24 leaves generous headroom while still refusing a value that is obviously not a
 * multiplier — a 60-digit string is a corrupt read, and a corrupt read must not rewrite a
 * balance.
 */
const MAX_SCALE = 24;

const POW10: bigint[] = [];
function pow10(n: number): bigint {
  if (POW10[n] === undefined) POW10[n] = 10n ** BigInt(n);
  return POW10[n]!;
}

/**
 * Parse a plain decimal string exactly. Deliberately strict: no exponent notation, no
 * leading `+`, no whitespace, no sign. These are not conveniences we are refusing — every
 * one of them is a shape that means the value did not come from where we think it did, and
 * "1e-3" silently parsed as 1 would zero nothing and multiply everything.
 */
export function parseDecimal(raw: string): Outcome<Decimal> {
  if (typeof raw !== "string" || raw.length === 0) return held("multiplier is empty");
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    return held(`multiplier "${raw}" is not a plain non-negative decimal`);
  }
  const [intPart = "", fracPart = ""] = raw.split(".");
  if (fracPart.length > MAX_SCALE) {
    return held(`multiplier "${raw}" carries more than ${MAX_SCALE} decimal places`);
  }
  const units = BigInt(intPart + fracPart);
  return ok({ units, scale: fracPart.length });
}

/** Render a Decimal back to its canonical string. Round-trips with {@link parseDecimal}. */
export function formatDecimal(d: Decimal): string {
  if (d.scale === 0) return d.units.toString();
  const s = d.units.toString().padStart(d.scale + 1, "0");
  const cut = s.length - d.scale;
  return `${s.slice(0, cut)}.${s.slice(cut)}`.replace(/\.?0+$/, "") || "0";
}

/** Bring two decimals to a common scale so they can be compared or divided exactly. */
function align(a: Decimal, b: Decimal): { a: bigint; b: bigint } {
  const scale = Math.max(a.scale, b.scale);
  return { a: a.units * pow10(scale - a.scale), b: b.units * pow10(scale - b.scale) };
}

export function cmpDecimal(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const { a: x, b: y } = align(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function eqDecimal(a: Decimal, b: Decimal): boolean {
  return cmpDecimal(a, b) === 0;
}

export function isZero(d: Decimal): boolean {
  return d.units === 0n;
}

/**
 * base × decimal, truncated toward zero.
 *
 * TRUNCATION IS THE CONSERVATIVE DIRECTION AND THAT IS WHY IT IS THE RULE. A rounding mode
 * that can round UP would, at the last digit, claim a fraction of a unit the wallet does not
 * hold — and a balance that overstates by one unit is still a balance nobody can reproduce
 * from chain state.
 *
 * The error never compounds, because an adjusted quantity is always recomputed from the RAW
 * quantity against the current multiplier — never from the previously adjusted one. A chain
 * of reconciliations therefore has exactly one truncation in it, not one per event.
 */
export function mulBase(base: bigint, d: Decimal): bigint {
  return (base * d.units) / pow10(d.scale);
}

/**
 * The ratio of two decimals, to `scale` fractional digits, truncated.
 * Holds on a zero denominator rather than producing Infinity, which would render as a
 * balance.
 */
export function ratio(a: Decimal, b: Decimal, scale = 18): Outcome<Decimal> {
  if (b.units === 0n) return held("cannot divide by a zero multiplier");
  const { a: x, b: y } = align(a, b);
  return ok({ units: (x * pow10(scale)) / y, scale });
}

/**
 * Token quantity → USD value in 6-decimal base units.
 *
 * `qty` is in the MINT's base units and `priceBase` is 6-decimal USD for ONE WHOLE token, so
 * the mint's decimals must be supplied by the caller from the registry. Getting this wrong
 * is not a rounding error, it is a factor of a hundred.
 */
export function valueOfQty(qty: bigint, decimals: number, priceBase: bigint): bigint {
  return (qty * priceBase) / pow10(decimals);
}

/** The inverse: USD base units → token base units at a price. Truncated, same reason. */
export function qtyForValue(valueBase: bigint, decimals: number, priceBase: bigint): Outcome<bigint> {
  if (priceBase <= 0n) return held("cannot size a position against a non-positive price");
  return ok((valueBase * pow10(decimals)) / priceBase);
}

/**
 * SQLite INTEGER columns are JS numbers, i.e. exact only below 2^53. The headroom is large —
 * 2^53 six-decimal base units is $9 billion, and 2^53 eight-decimal token units is 90 million
 * tokens — but "large" is not "checked", and this is money. Every bigint that crosses into a
 * column goes through here.
 */
export const MAX_SAFE_BASE = BigInt(Number.MAX_SAFE_INTEGER);

export function toSafeNumber(n: bigint, what: string): Outcome<number> {
  if (n > MAX_SAFE_BASE || n < -MAX_SAFE_BASE) {
    return held(`${what} (${n.toString()}) is too large to store exactly`);
  }
  return ok(Number(n));
}

/**
 * Return in basis points against the dollars actually contributed.
 *
 * Holds on a zero basis rather than dividing: a position that cost nothing — a sponsored
 * first gram — has no meaningful percentage return, and "∞%" or "NaN" on a savings screen is
 * worse than an honest blank.
 */
export function returnBps(valueBase: bigint, contributedBase: bigint): Outcome<number> {
  if (contributedBase <= 0n) {
    return held("no contributed value to measure a return against");
  }
  const bps = ((valueBase - contributedBase) * 10_000n) / contributedBase;
  return toSafeNumber(bps, "return");
}

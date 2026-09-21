import { type Outcome, held, ok } from "@/lib/outcome";
import { TOTAL_BPS } from "./slice";

/**
 * THE MINIMUM THAT MUST ARRIVE — a mirror of `min_out_raw` in the program.
 *
 * The keeper uses it to decide whether a Jupiter quote will pass the on-chain check before
 * paying a fee to find out; a screen uses it to say "at least 0.0259 SPYx" beside a quote.
 * The program's copy is the one that decides. `min-out.test.ts` holds the two to the same
 * numbers on the same inputs.
 *
 * `price`, `conf`, `expo` are Pyth's own. The band is taken AGAINST the owner — price plus
 * confidence — then the owner's tolerance is applied.
 *
 * `multiplierE12` is set when the feed prices a UI unit (one share) and the mint rebases.
 * Raw × multiplier = UI, so the min in UI units divides by the multiplier to reach raw.
 */
export function minOutRaw(input: {
  readonly sliceUsdc: bigint;
  readonly toleranceBps: number;
  readonly price: bigint;
  readonly conf: bigint;
  readonly expo: number;
  readonly assetDecimals: number;
  readonly multiplierE12: bigint | null;
}): Outcome<bigint> {
  const { sliceUsdc, toleranceBps, price, conf, expo, assetDecimals, multiplierE12 } = input;
  if (price <= 0n) return held("The price is not positive.");
  if (!Number.isInteger(expo) || expo > 0 || expo < -18) return held("The price exponent is implausible.");
  if (!Number.isInteger(assetDecimals) || assetDecimals < 0 || assetDecimals > 18) {
    return held("The asset's decimals are implausible.");
  }
  if (toleranceBps < 0 || toleranceBps >= TOTAL_BPS) return held("The tolerance is out of range.");

  const pHi = price + conf;
  const numerator =
    sliceUsdc * BigInt(TOTAL_BPS - toleranceBps) * 10n ** BigInt(assetDecimals) * 10n ** BigInt(-expo);
  const denominator = 1_000_000n * BigInt(TOTAL_BPS) * pHi;
  let min = numerator / denominator;

  if (multiplierE12 !== null) {
    if (multiplierE12 <= 0n) return held("The multiplier is not positive.");
    min = (min * 1_000_000_000_000n) / multiplierE12;
  }
  return ok(min);
}

/** A Decimal-string multiplier (as the mint publishes it) to the program's 1e12 fixed point. */
export function multiplierToE12(multiplier: number): bigint {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0n;
  return BigInt(Math.floor(multiplier * 1e12 + 0.5));
}

/**
 * A `Decimal` multiplier to the program's 1e12 fixed point, exactly.
 *
 * `multiplierToE12` goes through a JS number, which is fine for a literal like 1 but not for
 * a multiplier read off a mint: 1.005714560286254 is not representable in binary floating
 * point, and this value scales the least a sweep may accept. Decimal carries `units` and
 * `scale`, so the conversion is integer arithmetic throughout.
 */
export function decimalToE12(d: { readonly units: bigint; readonly scale: number }): bigint {
  if (!Number.isInteger(d.scale) || d.scale < 0 || d.scale > 36) return 0n;
  if (d.units <= 0n) return 0n;
  if (d.scale <= 12) return d.units * 10n ** BigInt(12 - d.scale);
  // More precision than the fixed point holds: truncate, never round up. A min-out that
  // rounds up is a sweep that refuses a fill the program would have accepted; rounding down
  // can only ever accept one the program then checks again itself.
  return d.units / 10n ** BigInt(d.scale - 12);
}

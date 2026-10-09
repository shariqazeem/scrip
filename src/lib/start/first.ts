import { RECENT_DAYS, type Inflow } from "@/lib/save/amount";
import { DEFAULT_CAP_USDC, DEFAULT_MIN_INBOUND, MIN_SLICE, TOTAL_BPS } from "@/lib/rule/slice";

/**
 * THE FIRST PAYMENT — what the rule saves the moment it turns on, so a person watches an
 * automatic save happen instead of being told one will.
 *
 * The rule saves what lands after it is on. Until 9 October that meant a new saver saw nothing
 * automatic at all: the start card bought a first share with a plain swap, and the rule then
 * waited for a payment that might come days later. The founder, after doing it: "it feels like
 * just a swap." Now the start transaction sets the last payment aside for the instant the rule
 * turns on and hands it straight back (`lib/start/build.ts`), so the program counts it as
 * arriving, and Scrip's servers save its slice through the same path as every payment after:
 * the delegate, Jupiter, a Pyth-bounded minimum, a receipt the program writes.
 *
 * Which money: the wallet's latest payment of the last thirty days, as much of it as the wallet
 * still holds; failing that, the USDC it holds (a wallet funded by its own swap was never
 * "paid"). Bounded twice: the slice must reach the program's $0.50 minimum, and it may take at
 * most $50, a quarter of the $200 limit, so the next payments still have room to save.
 */

/** The most a first save may take: a quarter of the $200 limit, so the payments after it still save. */
export const FIRST_SLICE_MAX_USDC = 50_000_000n;

export type FirstPayment = {
  /** What the rule counts as arriving when it turns on, in USDC base units. */
  readonly basisUsdc: bigint;
  /** What the first save takes: the program's own arithmetic on that basis. */
  readonly sliceUsdc: bigint;
  /** The payment it starts with; null when it is USDC the wallet holds but was not paid lately. */
  readonly payment: { readonly sig: string; readonly at: number; readonly usdc: bigint } | null;
  /** True when only part of the payment counts, because its slice would pass the $50 bound. */
  readonly capped: boolean;
};

/** `compute_slice`'s arithmetic for an arrival against an empty watermark: floor, then the cap. */
export function sliceOf(basisUsdc: bigint, rateBps: number): bigint {
  const taxable = basisUsdc < DEFAULT_CAP_USDC ? basisUsdc : DEFAULT_CAP_USDC;
  return (taxable * BigInt(rateBps)) / BigInt(TOTAL_BPS);
}

export function firstPayment(input: { readonly inflows: readonly Inflow[]; readonly usdcBalance: bigint; readonly rateBps: number; readonly nowUnix: number }): FirstPayment | null {
  const { usdcBalance, rateBps } = input;
  if (!Number.isInteger(rateBps) || rateBps <= 0 || usdcBalance <= 0n) return null;
  const since = input.nowUnix - RECENT_DAYS * 86_400;
  const last = [...input.inflows].filter((f) => f.at >= since && f.usdc > 0n).sort((a, b) => b.at - a.at)[0] ?? null;

  let basis: bigint;
  let payment: FirstPayment["payment"] = null;
  const fromLast = last ? (last.usdc < usdcBalance ? last.usdc : usdcBalance) : 0n;
  if (last && sliceOf(fromLast, rateBps) >= MIN_SLICE) {
    basis = fromLast;
    payment = { sig: last.sig, at: last.at, usdc: last.usdc };
  } else if (sliceOf(usdcBalance, rateBps) >= MIN_SLICE) {
    basis = usdcBalance;
  } else {
    return null;
  }

  // The largest basis whose slice stays within the bound: floor(max × 10,000 / rate).
  const maxBasis = (FIRST_SLICE_MAX_USDC * BigInt(TOTAL_BPS)) / BigInt(rateBps);
  const capped = basis > maxBasis;
  if (capped) basis = maxBasis;
  const slice = sliceOf(basis, rateBps);
  if (basis < DEFAULT_MIN_INBOUND || slice < MIN_SLICE) return null;
  return { basisUsdc: basis, sliceUsdc: slice, payment, capped };
}

/**
 * HOW MUCH TO SAVE — the first line a connected wallet reads, and the chips under it.
 *
 * The front door opens on income, not on shopping: "You received $250 on 6 Oct. Save 10%:
 * $25." That line is only offered when it can be kept. The slice comes from the latest
 * payment the wallet actually received, and the wallet must be able to spend it right now;
 * otherwise the person gets the plain chips, never a number the wallet cannot fill.
 */

export const SAVE_CHIPS_USD = [5, 10, 25] as const;
export const DEFAULT_SAVE_USD = 5;
/** The share of a payment the first line offers. The rule's own default is the same 10%. */
export const SUGGEST_RATE_BPS = 1_000;
/** The smallest save. Below a dollar, the network fee and the route eat too much of it. */
export const MIN_SAVE_USDC = 1_000_000n;
/** The largest save in one signature. A bigger amount is a trade, not a save; Jupiter is right there. */
export const MAX_SAVE_USDC = 10_000_000_000n;
/** A payment older than this is not "lately". */
export const RECENT_DAYS = 30;

/** One payment into the wallet's USDC account, read from a transaction the wallet did not sign. */
export type Inflow = {
  readonly sig: string;
  /** Block time, unix seconds. */
  readonly at: number;
  /** USDC base units that landed. */
  readonly usdc: bigint;
  /** The wallet that sent it, when the transaction says. */
  readonly from: string | null;
};

export type Suggestion = {
  readonly inflow: Inflow;
  readonly rateBps: number;
  /** The slice: rate × the payment, to the cent. */
  readonly saveUsdc: bigint;
};

/**
 * The line to open on, or null for the chips.
 *
 * The latest payment of the last thirty days whose slice is at least the minimum save, and
 * only if the wallet can spend that slice now. A wallet that was paid $250 and has $12 left
 * is not offered $25; it is offered the chips, filtered to what it holds.
 */
export function suggestSave(inflows: readonly Inflow[], spendableUsdc: bigint, nowUnix: number, rateBps = SUGGEST_RATE_BPS): Suggestion | null {
  const since = nowUnix - RECENT_DAYS * 86_400;
  const latest = [...inflows].filter((f) => f.at >= since && f.usdc > 0n).sort((a, b) => b.at - a.at);
  for (const inflow of latest) {
    // To the cent: 10% of $137.43 is $13.74, never a rounded-up $13.75 the payment did not pay.
    const slice = ((inflow.usdc * BigInt(rateBps)) / 10_000n / 10_000n) * 10_000n;
    if (slice < MIN_SAVE_USDC) continue;
    if (slice > MAX_SAVE_USDC) return null;
    return slice <= spendableUsdc ? { inflow, rateBps, saveUsdc: slice } : null;
  }
  return null;
}

/** The chips a wallet can fill. Before a wallet is connected, every chip is offered. */
export function fillableChips(spendableUsdc: bigint | null): readonly number[] {
  if (spendableUsdc === null) return SAVE_CHIPS_USD;
  return SAVE_CHIPS_USD.filter((usd) => BigInt(usd) * 1_000_000n <= spendableUsdc);
}

/** Dollars typed or tapped → USDC base units, or a sentence saying why not. */
export function parseSaveUsd(raw: string | number): { ok: true; usdc: bigint } | { ok: false; why: string } {
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, why: "Enter an amount in dollars." };
  const usdc = BigInt(Math.round(n * 100)) * 10_000n;
  if (usdc < MIN_SAVE_USDC) return { ok: false, why: "The smallest save is $1." };
  if (usdc > MAX_SAVE_USDC) return { ok: false, why: "The largest save in one go is $10,000." };
  return { ok: true, usdc };
}

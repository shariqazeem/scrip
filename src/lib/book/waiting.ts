/**
 * WHY NOTHING IS SETTLING — in a sentence the owner and a stranger both read.
 *
 * `finish_sweep` refuses without a fully verified Pyth price under 600 seconds old with a
 * confidence band under 1%. For an equity that price does not exist around the clock: the
 * S&P 500 has no price on a Saturday, and no oracle at any price has one. The keeper
 * therefore waits, which is the rule working — the program never guesses a price, and never
 * lets an operator supply one.
 *
 * The keeper already reports this to `/health`. Until now no surface a person opens said it,
 * so money landing on a closed market looked like a product that had stopped. It is derived
 * here from the payload the register already polls: no extra chain read, no new endpoint.
 */
import { usdc } from "@/lib/format";

/** The keeper's own words, from `evaluate()` in `src/keeper/index.ts`. */
const PRICE_PREFIX = "waiting for a fresh price";
/** The keeper's policy minimum: it waits until a slice is worth its receipt. */
const SMALL_PREFIX = "waiting for $";

export type Waiting = {
  /** Four words for the status line, beside "watching <address>". */
  readonly chip: string;
  /** The paragraph under it. Never claims why the price is missing, only that it is. */
  readonly detail: string;
};

export function priceWait(input: {
  readonly ruleOn: boolean;
  readonly unswept: string;
  readonly symbol: string | null;
  readonly lastReason: string | null;
}): Waiting | null {
  if (!input.ruleOn) return null;
  if (input.lastReason?.startsWith(SMALL_PREFIX)) return smallWait(input.lastReason);
  if (!input.lastReason?.startsWith(PRICE_PREFIX)) return null;

  let unswept = 0n;
  try {
    unswept = BigInt(input.unswept);
  } catch {
    return null;
  }
  if (unswept <= 0n) return null;

  const asset = input.symbol ?? "the asset";
  return {
    chip: "waiting for a price",
    detail:
      `${usdc(unswept)} has landed and is still yours. Scrip settles against a price it can verify on ` +
      `chain — under ten minutes old, with a confidence band under one percent — and there is none for ` +
      `${asset} right now. Nothing is lost and nothing is guessed: the money stays in your wallet, and ` +
      `the rule settles it when a price returns.`,
  };
}

/**
 * A SLICE TOO SMALL TO BE WORTH ITS RECEIPT YET. Scrip's keepers save once the slice reaches
 * the policy minimum ($2 by default), so a payment of a few dollars waits for the next one
 * instead of spending most of itself on the receipt. Said plainly, with the minimum the keeper
 * itself reported, never a number this page made up.
 */
function smallWait(reason: string): Waiting | null {
  const min = /^waiting for \$([0-9.]+)/.exec(reason)?.[1];
  if (!min) return null;
  return {
    chip: `saving at $${min}`,
    detail:
      `The part of your last payments to save is under $${min}, so it waits for the next payment rather than ` +
      `spend most of itself on a receipt. It is still in your wallet, as USDC, and the next payment adds to it.`,
  };
}

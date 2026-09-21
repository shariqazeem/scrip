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

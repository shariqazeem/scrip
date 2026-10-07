import "server-only";

import type { QuoteBody } from "@/components/save/types";
import { offeredAssets } from "@/lib/assets/registry";
import { waitedFor } from "@/lib/pyth/price";
import { priceStates } from "@/lib/pyth/ready";
import { cluster } from "@/lib/solana/cluster";
import { type PickerStock, CATALOGUE_READ_AT, catalogue, defaultStock, disclosure, featured, toPicker } from "./catalogue";
import { nameOf } from "./names";
import { cachedQuote } from "./quote-cache";

/**
 * EVERYTHING THE SAVE CARD NEEDS, from one place: the front door and the app's own Save page
 * draw the same card, so they read the same catalogue, the same default and the same warm
 * quote. The quote is the cached one; the card refreshes it as soon as anything changes.
 */
export type SaveCardProps = {
  readonly stocks: readonly PickerStock[];
  readonly featured: readonly string[];
  readonly defaultMint: string;
  readonly initialQuote: QuoteBody | null;
  readonly readAt: string;
  readonly cluster: string;
  readonly disclosures: Readonly<Record<string, string>>;
};

export async function saveCardProps(): Promise<SaveCardProps> {
  const stock = defaultStock();
  const all = catalogue();
  const quote = await cachedQuote(stock, 5_000_000n, null);
  return {
    stocks: all.map(toPicker),
    featured: featured().map((s) => s.mint),
    defaultMint: stock.mint,
    initialQuote: quote.ok ? { quote: quote.value.quote, cost: quote.value.cost, solUsd: quote.value.solUsd } : null,
    readAt: CATALOGUE_READ_AT,
    cluster: cluster(),
    disclosures: Object.fromEntries(all.map((s) => [s.mint, disclosure(s)])),
  };
}

/**
 * WHAT SAVES AUTOMATICALLY TODAY. An automatic save settles only against a price the program
 * can verify on Solana, so "every payment" works today for exactly the stocks with one. Read,
 * never assumed: `known` is false when the chain could not be asked, and then nothing is said.
 */
export type AutomaticToday = {
  readonly known: boolean;
  /** Names, in the registry's order: "Nasdaq 100", "Gold", "Tesla". */
  readonly settling: readonly string[];
  readonly defaultSettles: boolean | null;
  /** When nothing settles: how old the newest verifiable price is, in words. */
  readonly newestWait: string | null;
};

export async function automaticToday(): Promise<AutomaticToday> {
  const offered = offeredAssets();
  const states = await priceStates(offered);
  const known = states.some((s) => s.ready !== null);
  const settling = offered.filter((_, i) => states[i]!.ready === true).map((a) => nameOf(a.symbol));
  const at = offered.findIndex((a) => a.mint === defaultStock().mint);
  const newest = Math.max(0, ...states.map((s) => s.lastAt ?? 0));
  return {
    known,
    settling,
    defaultSettles: at >= 0 ? states[at]!.ready : null,
    newestWait: known && settling.length === 0 ? waitedFor(newest || null) : null,
  };
}

/** "a, b and c". */
export function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

import "server-only";

import type { PublicKey } from "@solana/web3.js";
import { solUsd } from "@/lib/market";
import type { Outcome } from "@/lib/outcome";
import { type SaveCost, type SaveQuote, quoteSave } from "./build";
import type { SaveStock } from "./catalogue";

/**
 * ONE QUOTE PER STOCK, AMOUNT AND WALLET, HELD TEN SECONDS — shared by the front door and the
 * quote endpoint, so a page full of visitors asks Jupiter once rather than once each.
 */
const HOLD_MS = 10_000;
type Body = { quote: SaveQuote; cost: SaveCost; solUsd: number | null };
const g = globalThis as typeof globalThis & { __scripSaveQuoteCache?: Map<string, { at: number; value: Promise<Outcome<Body>> }> };
const cache = (g.__scripSaveQuoteCache ??= new Map());

export function cachedQuote(stock: SaveStock, usdc: bigint, owner: PublicKey | null): Promise<Outcome<Body>> {
  const key = `${stock.mint}:${usdc}:${owner?.toBase58() ?? ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < HOLD_MS) return hit.value;
  const value = Promise.all([quoteSave(stock, usdc, owner), solUsd()]).then(([q, sol]): Outcome<Body> => (q.ok ? { ok: true, value: { ...q.value, solUsd: sol } } : q));
  if (cache.size > 2_000) cache.clear();
  cache.set(key, { at: Date.now(), value });
  // A refusal is not worth holding: the next visitor asks again.
  void value.then((o) => {
    if (!o.ok) cache.delete(key);
  });
  return value;
}

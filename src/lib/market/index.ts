import "server-only";

import { type Asset, ruleAssets } from "@/lib/assets/registry";
import { multiplierInForce } from "@/lib/corporate-actions/multiplier";
import { readMintMultiplier } from "@/lib/corporate-actions/read-mint";
import { mainnetConnection } from "@/lib/solana/connection";
import { type Session, nyseSession } from "./nyse";

/**
 * THE MARKET, AS IT IS RIGHT NOW — for display, never for settlement.
 *
 * Every figure here is read live from a source anyone can query without a key: Jupiter's
 * price and token APIs for the tracker's price, the underlying's price, liquidity, volume
 * and holders; the mint itself for the dividend multiplier; the clock for the NYSE session.
 * The registry's mints are mainnet mints, so this is the same market on every cluster.
 *
 * Cached for thirty seconds per mint across every caller: a front door with a thousand
 * visitors asks Jupiter twice a minute, not a thousand times.
 */
export type MarketRow = {
  readonly mint: string;
  readonly symbol: string;
  readonly name: string;
  readonly underlying: string;
  readonly kind: Asset["kind"];
  /** USD per unit of the tracker on Jupiter. */
  readonly priceUsd: number | null;
  /** USD per share of the underlying, as Jupiter reports it. */
  readonly underlyingUsd: number | null;
  readonly change24hPct: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly holders: number | null;
  /** The live dividend multiplier as a decimal string, or null for a mint without one. */
  readonly multiplier: string | null;
  readonly multiplierWhy: string | null;
  readonly readAt: number;
};

export type Market = {
  readonly at: number;
  readonly session: Session;
  readonly rows: readonly MarketRow[];
};

const BASE = () => process.env.JUPITER_API_URL?.replace(/\/+$/, "") || (process.env.JUPITER_API_KEY ? "https://api.jup.ag" : "https://lite-api.jup.ag");
const TTL_MS = 30_000;
let cache: { at: number; value: Promise<Market> } | null = null;

export function market(): Promise<Market> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = read();
  cache = { at: Date.now(), value };
  return value;
}

async function read(): Promise<Market> {
  const now = Math.floor(Date.now() / 1000);
  const assets = ruleAssets().filter((a) => !a.singleName);
  const [tokens, multipliers] = await Promise.all([jupiterTokens(assets.map((a) => a.mint)), Promise.all(assets.map((a) => multiplierOf(a, now)))]);
  const rows: MarketRow[] = assets.map((a, i) => {
    const t = tokens.get(a.mint);
    const m = multipliers[i]!;
    return {
      mint: a.mint,
      symbol: a.symbol,
      name: a.name,
      underlying: a.underlying,
      kind: a.kind,
      priceUsd: t?.usdPrice ?? null,
      underlyingUsd: t?.underlyingUsd ?? null,
      change24hPct: t?.change24h ?? null,
      liquidityUsd: t?.liquidity ?? null,
      volume24hUsd: t?.volume24h ?? null,
      holders: t?.holders ?? null,
      multiplier: m.value,
      multiplierWhy: m.why,
      readAt: now,
    };
  });
  return { at: now, session: nyseSession(now), rows };
}

type Token = { usdPrice: number | null; underlyingUsd: number | null; change24h: number | null; liquidity: number | null; volume24h: number | null; holders: number | null };

/** Jupiter's token API (liquidity, holders, 24h volume) and price API (the underlying's price). */
async function jupiterTokens(mints: readonly string[]): Promise<Map<string, Token>> {
  const out = new Map<string, Token>();
  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.JUPITER_API_KEY?.trim();
  if (key) headers["x-api-key"] = key;
  const [search, price] = await Promise.all([
    fetch(`${BASE()}/tokens/v2/search?query=${mints.join(",")}`, { headers, cache: "no-store", signal: AbortSignal.timeout(6_000) })
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .catch(() => null),
    fetch(`${BASE()}/price/v3?ids=${mints.join(",")}`, { headers, cache: "no-store", signal: AbortSignal.timeout(6_000) })
      .then((r) => (r.ok ? (r.json() as Promise<unknown>) : null))
      .catch(() => null),
  ]);
  const byId = new Map<string, Record<string, unknown>>();
  if (Array.isArray(search)) for (const t of search as Array<Record<string, unknown>>) if (typeof t.id === "string") byId.set(t.id, t);
  const prices = (price && typeof price === "object" ? (price as Record<string, Record<string, unknown> | undefined>) : {}) ?? {};
  for (const mint of mints) {
    const t = byId.get(mint);
    const p = prices[mint];
    const s24 = t?.stats24h && typeof t.stats24h === "object" ? (t.stats24h as Record<string, unknown>) : null;
    const stock = p?.stockData && typeof p.stockData === "object" ? (p.stockData as Record<string, unknown>) : null;
    const usdPrice = num(p?.usdPrice) ?? num(t?.usdPrice);
    if (!t && !p) continue;
    out.set(mint, {
      usdPrice,
      underlyingUsd: num(stock?.price),
      change24h: num(p?.priceChange24h) ?? num(s24?.priceChange),
      liquidity: num(t?.liquidity) ?? num(p?.liquidity),
      volume24h: s24 ? (num(s24.buyVolume) ?? 0) + (num(s24.sellVolume) ?? 0) : null,
      holders: num(t?.holderCount),
    });
  }
  return out;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
let solCache: { at: number; value: Promise<number | null> } | null = null;

/**
 * SOL in dollars on Jupiter, for DISPLAY: what a lamport figure means in money a person reads —
 * a receipt's cost, the rule's float. Never an input to a settlement. Cached thirty seconds.
 */
export function solUsd(): Promise<number | null> {
  if (solCache && Date.now() - solCache.at < TTL_MS) return solCache.value;
  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.JUPITER_API_KEY?.trim();
  if (key) headers["x-api-key"] = key;
  const value = fetch(`${BASE()}/price/v3?ids=${SOL_MINT}`, { headers, cache: "no-store", signal: AbortSignal.timeout(6_000) })
    .then((r) => (r.ok ? (r.json() as Promise<Record<string, Record<string, unknown> | undefined>>) : null))
    .then((j) => num(j?.[SOL_MINT]?.usdPrice))
    .catch(() => null);
  solCache = { at: Date.now(), value };
  return value;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** The live multiplier for a mint that carries one, from the mint account. */
async function multiplierOf(a: Asset, now: number): Promise<{ value: string | null; why: string | null }> {
  if (!a.powers.hasMultiplier) return { value: null, why: null };
  const read = await readMintMultiplier(mainnetConnection(), a, now).catch(() => null);
  if (!read) return { value: null, why: "could not reach the mint" };
  if (!read.ok) return { value: null, why: read.why };
  if (read.value.kind !== "scaled") return { value: null, why: null };
  const live = multiplierInForce(read.value.snapshot, now);
  if (!live.ok) return { value: null, why: live.why };
  return { value: live.value.raw, why: null };
}

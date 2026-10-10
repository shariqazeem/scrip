import "server-only";

import { Rounding, getDeltaAmountBaseUnsigned, getDeltaAmountQuoteUnsigned, getPriceFromSqrtPrice } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { type Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { type Outcome, held, ok } from "@/lib/outcome";
import { readTxViews } from "@/lib/solana/tx-view";
import { type ChainLaunch, curveClient } from "./launches";
import { DAMM_V2_PROGRAM_ID, curveQuote } from "./preset";

/**
 * A LAUNCH'S CURVE, DRAWN FROM THE CHAIN — the price path its config fixes (price against the stock
 * that has flowed in, from launch to graduation), where it is now, and every real trade on it,
 * placed on that path by what it left in the curve's token vault. Nothing here is a quote or a
 * forecast: the shape is the config Meteora's program enforces, and each mark is a transaction.
 *
 * The base vault is the measure because fees are collected in the stock: the token vault holds
 * only what the curve has not yet sold, so `supply − vault` is exactly how far along a trade left it.
 * The one transaction that names Meteora's DAMM v2 program is the graduation, not a trade.
 */
export type CurvePoint = { readonly quote: number; readonly price: number };
export type CurveMark = CurvePoint & { readonly at: number; readonly side: "buy" | "sell"; readonly sig: string };
export type CurveShape = {
  /** The whole path, launch to graduation: stock in the curve (whole units) and price (stock per token). */
  readonly points: readonly CurvePoint[];
  readonly threshold: number;
  readonly now: CurvePoint;
  readonly marks: readonly CurveMark[];
  /** The graduation transaction, when there is one. */
  readonly graduated: { readonly at: number; readonly sig: string } | null;
};

type Segment = { lower: BN; upper: BN; liquidity: BN };

function segmentsOf(start: BN, end: BN, curve: ReadonlyArray<{ sqrtPrice: BN; liquidity: BN }>): Segment[] {
  const out: Segment[] = [];
  let lower = start;
  for (const c of curve) {
    if (c.sqrtPrice.isZero() || lower.gte(end)) break;
    const upper = BN.min(c.sqrtPrice, end);
    if (upper.gt(lower)) out.push({ lower, upper, liquidity: c.liquidity });
    lower = c.sqrtPrice;
  }
  return out;
}

/** Stock in, and tokens out, from launch to a sqrt price: the sum over the segments below it. */
function along(segments: readonly Segment[], s: BN): { quoteRaw: BN; baseRaw: BN } {
  let quoteRaw = new BN(0);
  let baseRaw = new BN(0);
  for (const g of segments) {
    if (s.lte(g.lower)) break;
    const top = BN.min(s, g.upper);
    quoteRaw = quoteRaw.add(getDeltaAmountQuoteUnsigned(g.lower, top, g.liquidity, Rounding.Down));
    baseRaw = baseRaw.add(getDeltaAmountBaseUnsigned(g.lower, top, g.liquidity, Rounding.Down));
  }
  return { quoteRaw, baseRaw };
}

/** The sqrt price at which the curve has sold `baseRaw` tokens: a binary search, the path being monotonic. */
function sqrtAtSold(segments: readonly Segment[], start: BN, end: BN, baseRaw: BN): BN {
  let lo = start.clone();
  let hi = end.clone();
  for (let i = 0; i < 128 && hi.sub(lo).gtn(1); i++) {
    const mid = lo.add(hi).shrn(1);
    if (along(segments, mid).baseRaw.lt(baseRaw)) lo = mid;
    else hi = mid;
  }
  return hi;
}

const HOLD_MS = 60_000;
const g = globalThis as typeof globalThis & { __scripCurveShapes?: Map<string, { at: number; value: CurveShape }> };

export async function curveShape(conn: Connection, launch: ChainLaunch): Promise<Outcome<CurveShape>> {
  const cache = (g.__scripCurveShapes ??= new Map());
  const hit = cache.get(launch.pool);
  if (hit && Date.now() - hit.at < HOLD_MS) return ok(hit.value);
  try {
    const dbc = curveClient(conn);
    const [pool, config, supply] = await Promise.all([
      dbc.state.getPool(launch.pool),
      dbc.state.getPoolConfig(launch.config),
      conn.getTokenSupply(new PublicKey(launch.baseMint), "confirmed"),
    ]);
    if (!pool || !config) return held("This curve could not be read.");
    const quoteDecimals = curveQuote(launch.stock).decimals;
    const baseDecimals = supply.value.decimals;
    const start = config.sqrtStartPrice as BN;
    const end = config.migrationSqrtPrice as BN;
    const segments = segmentsOf(start, end, config.curve as Array<{ sqrtPrice: BN; liquidity: BN }>);
    if (segments.length === 0) return held("This curve has no shape to draw.");
    const point = (s: BN): CurvePoint => ({
      quote: Number(along(segments, s).quoteRaw.toString()) / 10 ** quoteDecimals,
      price: Number(getPriceFromSqrtPrice(s, baseDecimals, quoteDecimals).toString()),
    });

    // The path, sampled evenly in sqrt price: stock in is linear in it, so the samples spread evenly.
    const STEPS = 96;
    const span = end.sub(start);
    const points: CurvePoint[] = [];
    for (let i = 0; i <= STEPS; i++) points.push(point(start.add(span.muln(i).divn(STEPS))));

    // Every trade, placed by what it left in the token vault.
    const total = BigInt(supply.value.amount);
    const vault = (pool.poolState.baseVault as PublicKey).toBase58();
    const sigs = await conn.getSignaturesForAddress(new PublicKey(launch.pool), { limit: 200 }, "confirmed");
    const views = await readTxViews(
      conn,
      sigs.filter((x) => !x.err).map((x) => x.signature),
    );
    const marks: CurveMark[] = [];
    let graduated: CurveShape["graduated"] = null;
    for (const v of views) {
      if (!v || v.err) continue;
      const i = v.keys.indexOf(vault);
      if (i < 0) continue;
      const pre = v.preTokenBalances.find((b) => b.accountIndex === i);
      const post = v.postTokenBalances.find((b) => b.accountIndex === i);
      const before = pre ? BigInt(pre.uiTokenAmount.amount) : total;
      const after = BigInt(post?.uiTokenAmount.amount ?? "0");
      if (after === before) continue;
      // Graduation moves the vault's tokens into the new DAMM v2 pool: the end of the path, not a trade.
      if (v.keys.includes(DAMM_V2_PROGRAM_ID.toBase58())) {
        graduated = { at: v.blockTime, sig: v.sig };
        continue;
      }
      const sold = total - after;
      const s = sqrtAtSold(segments, start, end, new BN(sold.toString()));
      marks.push({ ...point(s), at: v.blockTime, side: after < before ? "buy" : "sell", sig: v.sig });
    }
    marks.sort((a, b) => a.at - b.at);

    const last = points[points.length - 1]!;
    const now = launch.migrated ? last : point(BN.min(BN.max(pool.poolState.sqrtPrice as BN, start), end));
    const value: CurveShape = { points, threshold: last.quote, now, marks, graduated };
    cache.set(launch.pool, { at: Date.now(), value });
    return ok(value);
  } catch (err) {
    return held(`The curve could not be drawn (${err instanceof Error ? err.message : String(err)}).`);
  }
}

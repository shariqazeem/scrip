import { PublicKey } from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
import { latest as hermesLatest } from "@/lib/pyth/hermes";
import { parsePriceAccount, settleable } from "@/lib/pyth/price";
import { FEED_MAX_AGE_SECONDS, MAX_CONF_BPS } from "@/lib/rule/slice";
import { connection } from "@/lib/solana/connection";

/**
 * COULD A SWEEP SETTLE RIGHT NOW? — read from the asset's pinned Pyth accounts, with the three
 * checks `finish_sweep` applies: fully verified, under ten minutes old, band under 1%.
 *
 * For the front door's "within seconds", which is true on a weekday and false on a Saturday.
 * `null` when the asset has no pinned account or the chain could not be read: the caller then
 * promises no timing at all rather than guess. Held for twenty seconds and shared, because
 * every visitor lands on the same register.
 */
const HOLD_MS = 20_000;
type Held = { at: number; ready: boolean | null };
const g = globalThis as typeof globalThis & { __scripSettleReady?: Map<string, Held> };
const cache = (g.__scripSettleReady ??= new Map<string, Held>());

export async function settleableNow(asset: Asset | undefined, now = Date.now()): Promise<boolean | null> {
  if (!asset) return null;
  const hit = cache.get(asset.mint);
  if (hit && now - hit.at < HOLD_MS) return hit.ready;

  const accounts = [asset.feedRaw?.account, asset.feedAdjusted?.account].filter((a): a is string => typeof a === "string" && a.length > 0);
  let ready: boolean | null = null;
  if (accounts.length > 0) {
    try {
      const infos = await connection().getMultipleAccountsInfo(accounts.map((a) => new PublicKey(a)), "confirmed");
      const nowSec = Math.floor(now / 1000);
      ready = infos.some((info) => {
        if (!info) return false;
        const p = parsePriceAccount(info.data);
        return p.ok && settleable(p.value, nowSec, FEED_MAX_AGE_SECONDS, MAX_CONF_BPS).ok;
      });
    } catch {
      ready = null;
    }
  }
  cache.set(asset.mint, { at: now, ready });
  return ready;
}

/**
 * THE NEWEST PRICE THE CHAIN HOLDS for an asset, with whether a sweep could settle against it:
 * for a sentence that says how long automatic saving has been waiting, in the chain's own
 * numbers. Pyth's sponsored on-chain push for US equities and gold stopped around 28 September
 * 2026; the pinned accounts still exist and say so through their publish time.
 */
export type PriceState = { readonly ready: boolean | null; readonly lastAt: number | null };

const ageCache = (g as typeof globalThis & { __scripPriceAge?: Map<string, { at: number; state: PriceState }> }).__scripPriceAge ?? new Map<string, { at: number; state: PriceState }>();
(g as typeof globalThis & { __scripPriceAge?: typeof ageCache }).__scripPriceAge = ageCache;

export async function priceState(asset: Asset | undefined, now = Date.now()): Promise<PriceState> {
  if (!asset) return { ready: null, lastAt: null };
  return (await priceStates([asset], now))[0]!;
}

/**
 * Every asset's state at once: the pinned accounts in ONE read (eleven parallel reads were
 * enough to draw a refusal from the endpoint, and a refused read is an unknown, not a "no"),
 * then Pyth's API for whichever has no fresh price on chain.
 */
export async function priceStates(assets: readonly Asset[], now = Date.now()): Promise<PriceState[]> {
  const out: Array<PriceState | null> = assets.map((a) => {
    const hit = ageCache.get(a.mint);
    return hit && now - hit.at < HOLD_MS ? hit.state : null;
  });
  const todo = assets.map((a, i) => (out[i] ? null : a)).filter((a): a is Asset => a !== null);
  if (todo.length === 0) return out as PriceState[];

  const nowSec = Math.floor(now / 1000);
  const accounts = todo.flatMap((a) => [a.feedRaw?.account, a.feedAdjusted?.account].filter((x): x is string => typeof x === "string" && x.length > 0));
  let infos: Array<{ data: Buffer } | null> | null = null;
  for (let attempt = 0; attempt < 2 && infos === null; attempt += 1) {
    try {
      infos = accounts.length ? await connection().getMultipleAccountsInfo(accounts.map((x) => new PublicKey(x)), "confirmed") : [];
    } catch {
      infos = null;
    }
  }
  const byAccount = new Map<string, { data: Buffer } | null>();
  accounts.forEach((acc, i) => byAccount.set(acc, infos ? (infos[i] ?? null) : null));

  const key = process.env.PYTH_API_KEY?.trim();
  const fresh = await Promise.all(
    todo.map(async (a): Promise<PriceState> => {
      let state: PriceState = { ready: infos === null ? null : false, lastAt: null };
      for (const acc of [a.feedRaw?.account, a.feedAdjusted?.account]) {
        const info = acc ? byAccount.get(acc) : null;
        if (!info) continue;
        const p = parsePriceAccount(info.data);
        if (!p.ok) continue;
        const ready = settleable(p.value, nowSec, FEED_MAX_AGE_SECONDS, MAX_CONF_BPS).ok;
        state = { ready: state.ready === true || ready, lastAt: Math.max(state.lastAt ?? 0, p.value.publishedAt) };
      }
      // Nothing on chain will do, but the keeper posts its own fully verified update when Pyth's
      // API will sign one for this deployment's key: then a sweep can settle, so say so.
      if (state.ready !== true && key) {
        for (const feed of [a.feedAdjusted, a.feedRaw]) {
          if (!feed) continue;
          const r = await hermesLatest([feed.feedId]).catch(() => null);
          const u = r && r.ok ? r.value[0] : undefined;
          if (!u) continue;
          if (settleable({ feedId: u.feedId, price: u.price, conf: u.conf, expo: u.expo, publishedAt: u.publishTime, verification: "full" }, nowSec + 45, FEED_MAX_AGE_SECONDS, MAX_CONF_BPS).ok) {
            state = { ready: true, lastAt: u.publishTime };
            break;
          }
        }
      }
      ageCache.set(a.mint, { at: now, state });
      return state;
    }),
  );
  let j = 0;
  return out.map((s) => s ?? fresh[j++]!);
}

import { PublicKey } from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
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

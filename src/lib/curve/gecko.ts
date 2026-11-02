import "server-only";

/**
 * GECKOTERMINAL'S CHART OF A LAUNCH, WHEN IT HAS ONE. GeckoTerminal lists a pool only after its
 * first trade, so a fresh launch's link opened a "not found" page (NASDAQTEST, 2 Nov 2026): the page
 * now asks GeckoTerminal's public API first and links only to a chart that exists — the graduated
 * pool once there is one, else the curve. An answer is held ten minutes when the pool is listed and
 * two when it is not, so a first trade shows up soon after; the API allows about 30 calls a minute.
 */
const API = "https://api.geckoterminal.com/api/v2/networks/solana/pools/";
const PAGE = "https://www.geckoterminal.com/solana/pools/";
const LISTED_MS = 10 * 60_000;
const UNLISTED_MS = 2 * 60_000;

type Held = { readonly at: number; readonly listed: boolean };
const g = globalThis as typeof globalThis & { __scripGecko?: Map<string, Held> };
const held = (g.__scripGecko ??= new Map<string, Held>());

/** Whether GeckoTerminal lists this pool: true, false, or null when it could not be asked. */
export async function geckoListed(pool: string, now = Date.now()): Promise<boolean | null> {
  const hit = held.get(pool);
  if (hit && now - hit.at < (hit.listed ? LISTED_MS : UNLISTED_MS)) return hit.listed;
  try {
    const res = await fetch(API + pool, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(3_000), cache: "no-store" });
    if (res.status !== 200 && res.status !== 404) return null;
    const listed = res.status === 200;
    held.set(pool, { at: now, listed });
    return listed;
  } catch {
    return null;
  }
}

/** The chart to link for a launch: its graduated pool's when listed, else its curve's, else none. */
export async function liveChartFor(launch: { readonly pool: string; readonly dammPool: string | null; readonly migrated: boolean }): Promise<string | null> {
  if (launch.migrated && launch.dammPool && (await geckoListed(launch.dammPool)) === true) return PAGE + launch.dammPool;
  if ((await geckoListed(launch.pool)) === true) return PAGE + launch.pool;
  return null;
}

import "server-only";

import data from "@/lib/assets/catalogue.json";
import { offeredAssets } from "@/lib/assets/registry";
import { AUTO_NAMES } from "@/lib/save/names";

/**
 * WHERE A STOCK'S LOGO COMES FROM: the image its issuer published for the token, as Jupiter's
 * verified list carries it (the catalogue's `icon`, read with the catalogue). Gold is not tagged
 * a stock there, so its image is pinned here, read from Jupiter's token list on 23 Oct 2026.
 *
 * Only these hosts are ever fetched, and only for a mint Scrip offers: the logo route takes a
 * mint, never a URL. `frame` marks xStocks' square tiles, which carry a frame of four triangles
 * at the edges that the route paints out before a logo is shown in a circle.
 */
export type LogoSource = {
  readonly url: string;
  readonly frame: "xstocks" | null;
  /** The name a person says, for the stand-in letter when the image cannot be had. */
  readonly name: string;
};

const HOSTS: ReadonlySet<string> = new Set([
  "xstocks-metadata.backed.fi",
  "backpack.exchange",
  "metadata.backpack.exchange",
  "cdn.ondo.finance",
  "s3-symbol-logo.tradingview.com",
  "raw.githubusercontent.com",
]);

/** Registry assets the catalogue does not carry, by symbol. Pinned to a commit, so it cannot change. */
const PINNED: Readonly<Record<string, string>> = {
  GOLD: "https://raw.githubusercontent.com/oroweb3/gold/de58e6cdc6531d2a65fba2a3f5c708a5c0d5c777/GOLD.png",
};

function allowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

let byMint: ReadonlyMap<string, LogoSource> | null = null;

function table(): ReadonlyMap<string, LogoSource> {
  if (byMint) return byMint;
  const m = new Map<string, LogoSource>();
  for (const r of data.stocks) {
    if (!r.icon || !allowed(r.icon)) continue;
    m.set(r.mint, {
      url: r.icon,
      frame: new URL(r.icon).hostname === "xstocks-metadata.backed.fi" ? "xstocks" : null,
      name: AUTO_NAMES[r.symbol] ?? r.name,
    });
  }
  for (const a of offeredAssets()) {
    const url = PINNED[a.symbol];
    if (url && !m.has(a.mint) && allowed(url)) m.set(a.mint, { url, frame: null, name: AUTO_NAMES[a.symbol] ?? a.name });
  }
  byMint = m;
  return m;
}

/** The logo for a mint Scrip offers, or null for anything else. */
export function logoSource(mint: string): LogoSource | null {
  return table().get(mint) ?? null;
}

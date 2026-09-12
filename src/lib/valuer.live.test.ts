/**
 * @vitest-environment node
 *
 * Node, not jsdom: this decodes chain bytes, and under jsdom the global `Uint8Array` is a
 * different constructor from the one a Node Buffer is built with. See registry.live.test.ts.
 */
import { Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { ASSETS, assetBySymbol } from "./assets/registry";
import { multiplierInForce } from "./corporate-actions/multiplier";
import { readMintMultiplier } from "./corporate-actions/read-mint";
import { formatDecimal, parseDecimal } from "./money";
import { readPrice } from "./pyth/read";
import { describeAge } from "./pyth/price";

/**
 * THE CROSS-CHECK — the strongest single proof that the corporate-action handling is right.
 *
 * SPYx is priced two independent ways on Pyth:
 *
 *     Crypto.SPYX/USD     the xStocks TOKEN, which already carries the multiplier
 *     Equity.US.SPY/USD   the underlying SHARE, which does not
 *
 * So their ratio must equal the live multiplier. If it does not, either our multiplier is
 * wrong or one of the feeds is stale — and the test says which, because it prints both ages.
 * No amount of unit testing can establish this; only mainnet can.
 *
 *     npm run test:valuer
 */
const LIVE = process.env.VALUER_LIVE === "1";
const rpc = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

describe.runIf(LIVE)("mainnet cross-check", () => {
  const connection = new Connection(rpc, "confirmed");

  it("SPYX/USD ÷ SPY/USD equals the live multiplier, to within feed latency", async () => {
    const spy = assetBySymbol("SPYx")!;
    const now = Math.floor(Date.now() / 1000);

    const tokenPrice = await readPrice(connection, spy.price);
    const sharePrice = await readPrice(connection, spy.priceCrossCheck!);
    const read = await readMintMultiplier(connection, spy, now);
    expect(tokenPrice.ok, tokenPrice.ok ? "" : tokenPrice.why).toBe(true);
    expect(sharePrice.ok, sharePrice.ok ? "" : sharePrice.why).toBe(true);
    expect(read.ok, read.ok ? "" : read.why).toBe(true);
    if (!tokenPrice.ok || !sharePrice.ok || !read.ok || read.value.kind !== "scaled") return;

    const live = multiplierInForce(read.value.snapshot, now);
    expect(live.ok, live.ok ? "" : live.why).toBe(true);
    if (!live.ok) return;

    const implied = Number(tokenPrice.value.base) / Number(sharePrice.value.base);
    const actual = Number(formatDecimal(live.value.value));
    const gapBps = Math.abs(implied / actual - 1) * 10_000;

    console.log(
      `  SPYX/USD $${(Number(tokenPrice.value.base) / 1e6).toFixed(4)} (${describeAge(now - tokenPrice.value.publishedAt)} old)\n` +
        `  SPY/USD  $${(Number(sharePrice.value.base) / 1e6).toFixed(4)} (${describeAge(now - sharePrice.value.publishedAt)} old)\n` +
        `  implied multiplier ${implied.toFixed(9)} vs live ${actual} — ${gapBps.toFixed(2)} bps apart`,
    );

    // 100bps of headroom: the two feeds are pushed on different schedules, and the equity one
    // sits out the whole weekend. A gap far beyond that is not latency, it is a wrong number.
    expect(gapBps).toBeLessThan(100);
  });

  it("every pinned price account is live, owned by the receiver, and carries its feed", async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const asset of ASSETS) {
      if (!asset.price.account) continue; // deliberately unpriced — GLDx, SLVon
      const p = await readPrice(connection, asset.price);
      expect(p.ok, p.ok ? "" : `${asset.symbol}: ${p.why}`).toBe(true);
      if (!p.ok) continue;
      console.log(
        `  ${asset.symbol.padEnd(6)} $${(Number(p.value.base) / 1e6).toFixed(4)}  ${describeAge(now - p.value.publishedAt)} old  · ${asset.price.label}`,
      );
      // Not a staleness assertion: a metal feed is legitimately hours old at a weekend, which
      // is the finding this whole module is built around. It must be READABLE, and it must
      // not be older than a product would show.
      expect(now - p.value.publishedAt).toBeLessThan(50 * 3600);
    }
  });

  it("a fund share is never given a metal price feed", async () => {
    // The rule, asserted against the config that could break it: if somebody ever "fixes" the
    // unpriced GLDx row by pointing it at XAU/USD, a share of the SPDR fund starts rendering
    // at the price of an ounce of gold — an eleven-fold overstatement of somebody's savings.
    for (const asset of ASSETS) {
      if (asset.kind !== "fund") continue;
      const metalFeeds = ASSETS.filter((a) => a.kind === "metal").map((a) => a.price.feedId);
      expect(metalFeeds, `${asset.symbol} borrows a metal price feed`).not.toContain(
        asset.price.feedId,
      );
    }
    expect(parseDecimal("1").ok).toBe(true);
  });
});

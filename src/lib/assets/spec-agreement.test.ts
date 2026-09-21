import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ASSETS, DEVNET_FEEDS, PYTH_RECEIVER, USDC_MINT, ruleAssets } from "./registry";

/**
 * TWO LISTS THAT DRIFT: the program compiles the registry in (`registry.rs`); the app reads
 * this one. A mint on one and not the other is a rule the app offers and the program
 * refuses, or an asset the program would buy and the app cannot name. This reads the Rust.
 */
const rs = readFileSync(join(__dirname, "..", "..", "..", "anchor", "programs", "scrip", "src", "registry.rs"), "utf8");
const pythRs = readFileSync(join(__dirname, "..", "..", "..", "anchor", "programs", "scrip", "src", "pyth.rs"), "utf8");

function rustConstPubkey(name: string): string {
  const m = new RegExp(`pub const ${name}: Pubkey = Pubkey::from_str_const\\("([1-9A-HJ-NP-Za-km-z]+)"\\);`).exec(rs);
  if (!m) throw new Error(`${name} not in registry.rs`);
  return m[1]!;
}

function rustFeed(name: string): string {
  const m = new RegExp(`pub const ${name}: \\[u8; 32\\] = hex32\\("([0-9a-f]{64})"\\);`).exec(rs);
  if (!m) throw new Error(`${name} not in registry.rs`);
  return m[1]!;
}

/** The rows of the mainnet REGISTRY table, as (mint const, raw feed const, adjusted feed const, xstocks). */
function rustRows(): Array<{ mint: string; raw: string; adjusted: string; xstocks: boolean }> {
  const table = /pub const REGISTRY: &\[Entry\] = &\[([\s\S]*?)\n\];/.exec(rs)?.[1];
  if (!table) throw new Error("REGISTRY table not found");
  return [...table.matchAll(/Entry \{ mint: (\w+), feed_raw: (\w+), feed_adjusted: (\w+), xstocks: (true|false) \}/g)].map((m) => ({
    mint: m[1]!,
    raw: m[2]!,
    adjusted: m[3]!,
    xstocks: m[4] === "true",
  }));
}

describe("the TypeScript registry and the program's agree", () => {
  const rows = rustRows();

  it("USDC is the same mint", () => {
    expect(rustConstPubkey("USDC_MINT")).toBe(USDC_MINT);
  });

  it("every rule asset in TypeScript is in the program's table, with the same feeds", () => {
    for (const a of ruleAssets()) {
      const row = rows.find((r) => rustConstPubkey(r.mint) === a.mint);
      expect(row, `${a.symbol} (${a.mint}) is not in registry.rs`).toBeTruthy();
      if (!row) continue;
      expect(rustFeed(row.raw), `${a.symbol} raw feed`).toBe(a.feedRaw?.feedId);
      if (row.adjusted === "ZERO_FEED") expect(a.feedAdjusted, `${a.symbol} adjusted feed`).toBeNull();
      else expect(rustFeed(row.adjusted), `${a.symbol} adjusted feed`).toBe(a.feedAdjusted?.feedId);
      expect(row.xstocks, `${a.symbol} xstocks flag`).toBe(a.issuer.name.includes("xStocks"));
    }
  });

  it("every row in the program's table is a rule asset in TypeScript", () => {
    const mints = new Set(ruleAssets().map((a) => a.mint));
    for (const r of rows) {
      expect(mints.has(rustConstPubkey(r.mint)), `${r.mint} is in registry.rs but not in registry.ts`).toBe(true);
    }
    expect(rows.length).toBe(ruleAssets().length);
  });

  it("the devnet stand-in feeds are the ones the devnet build compiles in", () => {
    expect(rustFeed("FEED_SOL_USD")).toBe(DEVNET_FEEDS.raw.feedId);
    expect(rustFeed("FEED_USDC_USD")).toBe(DEVNET_FEEDS.adjusted.feedId);
  });

  it("the Pyth receiver is the same program", () => {
    expect(pythRs).toContain(`Pubkey::from_str_const("${PYTH_RECEIVER}")`);
  });

  it("the pay-in asset is not a rule asset", () => {
    expect(ASSETS.find((a) => a.mint === USDC_MINT)?.ruleEligible).toBe(false);
  });
});

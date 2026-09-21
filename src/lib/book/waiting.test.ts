import { describe, expect, it } from "vitest";
import { priceWait } from "./waiting";

const on = { ruleOn: true, unswept: "25000000", symbol: "SPYx", lastReason: "waiting for a fresh price: no fully verified account under 600 s" };

describe("priceWait", () => {
  it("speaks only when the rule is on, money is unswept, and the keeper blames the price", () => {
    expect(priceWait(on)).not.toBeNull();
    expect(priceWait({ ...on, ruleOn: false })).toBeNull();
    expect(priceWait({ ...on, unswept: "0" })).toBeNull();
    expect(priceWait({ ...on, lastReason: "float empty: 0 lamports" })).toBeNull();
    expect(priceWait({ ...on, lastReason: null })).toBeNull();
  });

  it("names the real amount and the real asset, and never invents a reason", () => {
    const w = priceWait(on)!;
    expect(w.detail).toContain("$25");           // usdc() drops the cents on a whole dollar
    expect(priceWait({ ...on, unswept: "25500000" })!.detail).toContain("$25.50");
    expect(w.detail).toContain("SPYx");
    // The market may be closed, the publisher may be down, the feed may be unsponsored. The
    // copy must not pick one: it says the price is absent, which is all the chain proves.
    expect(w.detail).not.toMatch(/market is closed|weekend|Saturday|holiday/i);
  });

  it("survives a malformed amount rather than throwing on a surface", () => {
    expect(priceWait({ ...on, unswept: "not a number" })).toBeNull();
  });

  it("falls back to a neutral noun when the asset is unknown", () => {
    expect(priceWait({ ...on, symbol: null })!.detail).toContain("the asset");
  });
});

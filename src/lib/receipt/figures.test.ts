import { describe, expect, it } from "vitest";
import { KEEPER_TIP_LAMPORTS, describeDeviation, describeSeconds, fillVsPyth, landedToStock, splitCost } from "./figures";

// The first two mainnet sweeps, as their receipts record them. SPYx has 8 decimals and a
// scaled-UI multiplier of 1.005714560286254; both settled against Equity.US.SPY/USD (a share).
const M = "1.005714560286254";

describe("fill against Pyth", () => {
  it("reads the first sweep: $2.505 for 324,049 raw units, 0.04% above Pyth's $768.34", () => {
    const f = fillVsPyth({ paidUsdc: 2_505_000n, amountRaw: 324_049n, decimals: 8, price: 76_834_491n, expo: -5, multiplier: M })!;
    expect(f.perUnitUsd).toBeCloseTo(768.64, 2);
    expect(f.deviationBps).toBeCloseTo(3.8, 1);
    expect(describeDeviation(f.deviationBps)).toBe("0.04% above Pyth");
  });

  it("reads the second: $1.001 for 128,708 raw units, 0.12% below Pyth's $774.21", () => {
    const f = fillVsPyth({ paidUsdc: 1_001_000n, amountRaw: 128_708n, decimals: 8, price: 77_420_500n, expo: -5, multiplier: M })!;
    expect(f.deviationBps).toBeCloseTo(-11.6, 1);
    expect(describeDeviation(f.deviationBps)).toBe("0.12% below Pyth");
  });

  it("prices the token itself when the stamp is the token's feed: no multiplier", () => {
    const f = fillVsPyth({ paidUsdc: 900_000n, amountRaw: 207n, decimals: 6, price: 4_330_321n, expo: -3, multiplier: null })!;
    expect(f.perUnitUsd).toBeCloseTo(4347.83, 1);
    expect(f.deviationBps).toBeCloseTo(40.4, 0);
  });

  it("refuses to divide by nothing", () => {
    expect(fillVsPyth({ paidUsdc: 1n, amountRaw: 0n, decimals: 8, price: 1n, expo: 0, multiplier: null })).toBeNull();
    expect(fillVsPyth({ paidUsdc: 1n, amountRaw: 1n, decimals: 8, price: 0n, expo: 0, multiplier: null })).toBeNull();
  });

  it("says 'at Pyth' rather than print 0.00%", () => {
    expect(describeDeviation(0.3)).toBe("at Pyth’s price");
    expect(describeDeviation(-0.4)).toBe("at Pyth’s price");
  });
});

describe("landed to stock", () => {
  it("measures from the LAST arrival", () => {
    expect(landedToStock(1_000, [900, 990, null])).toBe(10);
  });
  it("says nothing when there is no time, or the gap is not this sweep's", () => {
    expect(landedToStock(1_000, [])).toBeNull();
    expect(landedToStock(1_000, [null, undefined])).toBeNull();
    expect(landedToStock(1_000, [1_010])).toBeNull();
    expect(landedToStock(100_000, [1_000])).toBeNull();
  });
  it("reads as seconds, then minutes", () => {
    expect(describeSeconds(6)).toBe("6 s");
    expect(describeSeconds(89)).toBe("89 s");
    expect(describeSeconds(268)).toBe("4 min 28 s");
    expect(describeSeconds(120)).toBe("2 min");
  });
});

describe("cost from the float", () => {
  const RENT = 2_519_680;
  it("splits a later sweep into the receipt's rent and the tip", () => {
    expect(splitCost(3_019_680, RENT)).toEqual({ totalLamports: 3_019_680, rentLamports: RENT, tipLamports: KEEPER_TIP_LAMPORTS, accountLamports: 0 });
  });
  it("names the owner's new asset account on a first sweep", () => {
    expect(splitCost(4_579_240, RENT)?.accountLamports).toBe(1_559_560);
  });
  it("refuses numbers that do not add up to what finish_sweep pays", () => {
    expect(splitCost(null, RENT)).toBeNull();
    expect(splitCost(2_000_000, RENT)).toBeNull();
    expect(splitCost(RENT + 100, RENT)).toBeNull();
  });
});

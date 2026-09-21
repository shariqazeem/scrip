import { describe, expect, it } from "vitest";
import { decimalToE12, minOutRaw, multiplierToE12 } from "./min-out";

/**
 * THE SAME NUMBERS AS `rule.rs`'s tests, on the same inputs. If the program's copy and this
 * one ever disagree, the keeper submits sweeps the program refuses — and pays for each.
 */
const SPYX_PRICE = 76_991_499_999n;
const SPYX_CONF = 20_800_595n;

const spyx = (over: Partial<Parameters<typeof minOutRaw>[0]> = {}) =>
  minOutRaw({
    sliceUsdc: 50_000_000n,
    toleranceBps: 100,
    price: SPYX_PRICE,
    conf: SPYX_CONF,
    expo: -8,
    assetDecimals: 8,
    multiplierE12: null,
    ...over,
  });

describe("minOutRaw mirrors min_out_raw", () => {
  it("fifty dollars of SPYx at one percent tolerance", () => {
    // 50e6 × 9900 × 1e8 × 1e8 / (1e6 × 1e4 × 77_012_300_594), truncated — the program's number.
    const m = spyx();
    expect(m.ok && m.value).toBe(6_427_544n);
  });

  it("a wider tolerance asks for less", () => {
    const tight = spyx({ toleranceBps: 50 });
    const loose = spyx({ toleranceBps: 300 });
    expect(tight.ok && loose.ok && loose.value < tight.value).toBe(true);
  });

  it("the confidence band is taken against the owner", () => {
    const none = spyx({ conf: 0n });
    const some = spyx();
    expect(none.ok && some.ok && some.value < none.value).toBe(true);
  });

  it("a UI-priced feed converts through the live multiplier", () => {
    const perShare = 76_555_000_000n;
    const raw = spyx({ price: perShare, conf: 0n });
    const adjusted = spyx({ price: perShare, conf: 0n, multiplierE12: 1_005_714_560_286n });
    expect(raw.ok && adjusted.ok).toBe(true);
    if (!raw.ok || !adjusted.ok) return;
    expect(adjusted.value < raw.value).toBe(true);
    const expected = (raw.value * 1_000_000_000_000n) / 1_005_714_560_286n;
    expect(adjusted.value - expected <= 1n && expected - adjusted.value <= 1n).toBe(true);
  });

  it("a multiplier of one changes nothing", () => {
    const a = spyx();
    const b = spyx({ multiplierE12: 1_000_000_000_000n });
    expect(a.ok && b.ok && a.value === b.value).toBe(true);
  });

  it("a six-decimal asset at a metal price", () => {
    const m = minOutRaw({ sliceUsdc: 50_000_000n, toleranceBps: 100, price: 436_500_000_000n, conf: 100_000_000n, expo: -8, assetDecimals: 6, multiplierE12: null });
    expect(m.ok && m.value > 11_000n && m.value < 11_500n).toBe(true);
  });

  it("refuses what the program refuses", () => {
    expect(spyx({ price: 0n }).ok).toBe(false);
    expect(spyx({ price: -5n }).ok).toBe(false);
    expect(spyx({ expo: 3 }).ok).toBe(false);
    expect(spyx({ multiplierE12: 0n }).ok).toBe(false);
  });
});

describe("multiplierToE12", () => {
  it("carries the issuer's float into the program's fixed point", () => {
    // The SPYx mint on 2026-09-12: the same rounding the program does (× 1e12 + 0.5, floor).
    expect(multiplierToE12(1.005714560286254)).toBe(1_005_714_560_286n);
    expect(multiplierToE12(1)).toBe(1_000_000_000_000n);
    expect(multiplierToE12(0)).toBe(0n);
    expect(multiplierToE12(Number.NaN)).toBe(0n);
  });
});

describe("decimalToE12", () => {
  it("is exact where a float is not", () => {
    // 1.005714560286254, the live SPYx multiplier on 2026-09-21.
    expect(decimalToE12({ units: 1005714560286254n, scale: 15 })).toBe(1005714560286n);
    expect(decimalToE12({ units: 1n, scale: 0 })).toBe(1_000_000_000_000n);
    expect(decimalToE12({ units: 15n, scale: 1 })).toBe(1_500_000_000_000n);
  });

  it("truncates rather than rounding up, so a min-out is never overstated", () => {
    expect(decimalToE12({ units: 1_9999999999999n, scale: 13 })).toBe(1_999999999999n);
  });

  it("refuses a multiplier it cannot compute with", () => {
    expect(decimalToE12({ units: 0n, scale: 0 })).toBe(0n);
    expect(decimalToE12({ units: -1n, scale: 0 })).toBe(0n);
    expect(decimalToE12({ units: 1n, scale: -1 })).toBe(0n);
  });
});

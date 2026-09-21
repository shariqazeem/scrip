import { describe, expect, it } from "vitest";
import { PRICE_UPDATE_V2_DISCRIMINATOR, displayable, parsePriceAccount, priceToUsd, priceToUsdcBase, settleable } from "./price";

/** A partial verification (level 0) carries one extra byte, so every field shifts by one. */
function fixture(level: number, price: bigint, conf: bigint, expo: number, publish: number): Uint8Array {
  const d = new Uint8Array(135);
  d.set(PRICE_UPDATE_V2_DISCRIMINATOR, 0);
  d[40] = level;
  const base = level === 1 ? 41 : 42;
  d.fill(7, base, base + 32);
  const v = new DataView(d.buffer);
  v.setBigInt64(base + 32, price, true);
  v.setBigUint64(base + 40, conf, true);
  v.setInt32(base + 48, expo, true);
  v.setBigInt64(base + 52, BigInt(publish), true);
  return d;
}

describe("parsePriceAccount", () => {
  it("reads every field at the program's offsets", () => {
    const p = parsePriceAccount(fixture(1, 76_991_499_999n, 20_800_595n, -8, 1_789_000_000));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.feedId).toBe("07".repeat(32));
    expect(p.value.price).toBe(76_991_499_999n);
    expect(p.value.conf).toBe(20_800_595n);
    expect(p.value.expo).toBe(-8);
    expect(p.value.publishedAt).toBe(1_789_000_000);
    expect(p.value.verification).toBe("full");
    expect(priceToUsd(p.value)).toBeCloseTo(769.915, 3);
    expect(priceToUsdcBase(p.value)).toBe(769_914_999n);
  });
  it("marks a partial verification, which the program refuses", () => {
    const p = parsePriceAccount(fixture(0, 1n, 0n, -8, 1));
    if (!p.ok) throw new Error(p.why);
    expect(p.value.verification).toBe("partial");
    expect(settleable(p.value, 1, 600, 100).ok).toBe(false);
  });
  it("refuses the wrong discriminator and a short account", () => {
    const d = fixture(1, 1n, 0n, -8, 1);
    d[0] = (d[0] ?? 0) ^ 1;
    expect(parsePriceAccount(d).ok).toBe(false);
    expect(parsePriceAccount(new Uint8Array(50)).ok).toBe(false);
  });
});

describe("settleable mirrors finish_sweep's three checks", () => {
  const p = parsePriceAccount(fixture(1, 76_991_499_999n, 20_800_595n, -8, 1_789_000_000));
  it("passes a fresh, tight, full price", () => {
    expect(p.ok && settleable(p.value, 1_789_000_100, 600, 100).ok).toBe(true);
  });
  it("holds when older than the bound", () => {
    expect(p.ok && settleable(p.value, 1_789_000_601, 600, 100).ok).toBe(false);
  });
  it("holds when the band is wider than 1%", () => {
    const wide = parsePriceAccount(fixture(1, 100_000_000_000n, 1_000_000_001n, -8, 1_789_000_000));
    expect(wide.ok && settleable(wide.value, 1_789_000_000, 600, 100).ok).toBe(false);
  });
});

describe("displayable", () => {
  const p = parsePriceAccount(fixture(1, 1n, 0n, -8, 1_789_000_000));
  it("shows a two-day-old price and refuses a three-day-old one", () => {
    expect(p.ok && displayable(p.value, 1_789_000_000 + 40 * 3600).ok).toBe(true);
    expect(p.ok && displayable(p.value, 1_789_000_000 + 72 * 3600).ok).toBe(false);
  });
});

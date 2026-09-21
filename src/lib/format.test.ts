import { describe, expect, it } from "vitest";
import { age, bps, dateUTC, fromBase, pythToUsd, short, since, sol, stampUTC, units, unitsFromRaw, usd, usdAligned, usdc } from "./format";

describe("usd", () => {
  it("reads clean when whole and always shows full cents when not", () => {
    expect(usd(500)).toBe("$500");
    expect(usd(459.4)).toBe("$459.40");
    expect(usd(1234567.891)).toBe("$1,234,567.89");
    expect(usd(-3.5)).toBe("-$3.50");
  });
  it("sheds floating-point dust before deciding whether a value is whole", () => {
    expect(usd(0.1 + 0.2)).toBe("$0.30");
    expect(usd(199.99999999)).toBe("$200");
  });
  it("always shows cents in the aligned variant, and reads USDC base units", () => {
    expect(usdAligned(500)).toBe("$500.00");
    expect(usdc(200_000_000n)).toBe("$200");
    expect(usdc(50_000_000)).toBe("$50");
    expect(usdc(1_234_567n)).toBe("$1.23");
  });
});

describe("units", () => {
  it("keeps four places and trailing zeros so a column cannot go ragged", () => {
    expect(units(0.0262)).toBe("0.0262");
    expect(units(1)).toBe("1.0000");
    expect(units(12.5)).toBe("12.5000");
  });
  it("reads raw token units at the mint's decimals, never a default", () => {
    expect(unitsFromRaw(2_620_000n, 8)).toBe("0.0262");
    expect(unitsFromRaw(2_620_000n, 6)).toBe("2.6200");
    expect(fromBase(100_000_000n, 8)).toBe(1);
  });
  it("groups thousands", () => {
    expect(units(1234.5)).toBe("1,234.5000");
  });
});

describe("bps, sol, pyth", () => {
  it("renders basis points as percentages", () => {
    expect(bps(1_000)).toBe("10%");
    expect(bps(2_550)).toBe("25.5%");
    expect(bps(5)).toBe("0.05%");
  });
  it("renders lamports as SOL", () => {
    expect(sol(50_000_000n)).toBe("0.05 SOL");
    expect(sol(3_400_000)).toBe("0.0034 SOL");
  });
  it("turns a Pyth price into dollars", () => {
    expect(pythToUsd(76_991_499_999n, -8)).toBeCloseTo(769.915, 3);
  });
});

describe("short", () => {
  it("shortens a base58 address and leaves a short string alone", () => {
    expect(short("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe("7xKXtg…gAsU");
    expect(short("abc")).toBe("abc");
  });
});

describe("dates", () => {
  it("formats deterministically in UTC with fixed month names", () => {
    expect(dateUTC(1_789_000_000)).toBe("10 Sep 2026");
    expect(stampUTC(1_789_000_000)).toBe("10 Sep 2026, 00:26 UTC");
  });
  it("steps through relative units and falls back to a date", () => {
    const now = 1_789_000_000 * 1000;
    expect(since(1_789_000_000 - 10, now)).toBe("just now");
    expect(since(1_789_000_000 - 180, now)).toBe("3 min ago");
    expect(since(1_789_000_000 - 7_200, now)).toBe("2 h ago");
    expect(since(1_789_000_000 - 86_400, now)).toBe("1 day ago");
    expect(since(1_789_000_000 - 3 * 86_400, now)).toBe("3 days ago");
    expect(since(1_789_000_000 - 30 * 86_400, now)).toBe("11 Aug 2026");
    expect(since(1_789_000_000 + 100, now)).toBe("just now");
  });
  it("describes an age for a caption", () => {
    expect(age(48)).toBe("48 s");
    expect(age(300)).toBe("5 min");
    expect(age(7_200)).toBe("2 h");
    expect(age(3 * 86_400)).toBe("3 days");
  });
});

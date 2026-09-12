import { describe, expect, it } from "vitest";
import {
  bps,
  cap,
  fromBase,
  grams,
  shares,
  short,
  shortDateUTC,
  since,
  stampUTC,
  troyOz,
  usd,
  usdAligned,
} from "./format";

describe("usd", () => {
  it("reads clean when whole and always shows full cents when not", () => {
    expect(usd(500)).toBe("$500");
    expect(usd(459.4)).toBe("$459.40");
    expect(usd(1234.567)).toBe("$1,234.57");
  });

  it("sheds floating-point dust before deciding whether a value is whole", () => {
    // 0.1 + 0.2 = 0.30000000000000004; rounding to cents first is what stops "$0.30" from
    // rendering as "$0.3" — or worse, from being treated as non-whole when it is.
    expect(usd(0.1 + 0.2)).toBe("$0.30");
    expect(usd(2.0000000001)).toBe("$2");
  });

  it("always shows cents in the aligned variant", () => {
    // "$0" beside "$0.50" in a tabular column reads as a rendering fault, not a round number.
    expect(usdAligned(0)).toBe("$0.00");
    expect(usdAligned(500)).toBe("$500.00");
  });
});

describe("quantities", () => {
  it("keeps trailing zeros so a column cannot go ragged", () => {
    expect(grams(12.5)).toBe("12.5000 g");
    expect(troyOz(3)).toBe("3.0000 oz");
    expect(shares(1)).toBe("1.000000");
  });

  it("renders a precision whose last digit is worth well under a cent", () => {
    // 4dp of a gram of gold is ~$0.011; 6dp of an SPY share is ~$0.0007. A rounded display
    // must never be able to hide value.
    expect(grams(0.0001)).toBe("0.0001 g");
    expect(shares(0.000001)).toBe("0.000001");
  });

  it("groups thousands", () => {
    expect(grams(1234.5)).toBe("1,234.5000 g");
  });
});

describe("fromBase", () => {
  it("scales by the MINT's decimals, never a default", () => {
    // Reading an 8-decimal equity token as 6-decimal USDC is a 100x error in a balance.
    expect(fromBase(1_500_000, 6)).toBe(1.5);
    expect(fromBase(1_500_000, 8)).toBe(0.015);
  });

  it("accepts bigint base units", () => {
    expect(fromBase(2_000_000n, 6)).toBe(2);
  });
});

describe("bps", () => {
  it("renders policy weights as percentages", () => {
    expect(bps(5000)).toBe("50%");
    expect(bps(2000)).toBe("20%");
    expect(bps(3000)).toBe("30%");
    expect(bps(2550)).toBe("25.5%");
  });
});

describe("short", () => {
  it("shortens a base58 address", () => {
    expect(short("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe("7xKXtg…gAsU");
  });

  it("leaves a short string alone rather than mangling it", () => {
    expect(short("abc")).toBe("abc");
  });
});

describe("dates", () => {
  const T = Date.UTC(2026, 8, 12, 14, 3, 0) / 1000; // 12 Sep 2026, 14:03 UTC

  it("formats deterministically in UTC with fixed month names", () => {
    // toLocaleDateString renders "Sep 12" on a US server and "12 Sep" in a European browser,
    // which is a React hydration mismatch on every SSR-ed date.
    expect(shortDateUTC(T)).toBe("Sep 12");
    expect(shortDateUTC(T, true)).toBe("Sep 12, 2026");
    expect(stampUTC(T)).toBe("12 Sep 2026, 14:03 UTC");
  });

  it("pads the clock", () => {
    expect(stampUTC(Date.UTC(2026, 0, 5, 4, 7, 0) / 1000)).toBe("5 Jan 2026, 04:07 UTC");
  });
});

describe("since", () => {
  const now = Date.UTC(2026, 8, 12, 12, 0, 0);
  const ago = (secs: number) => Math.floor(now / 1000) - secs;

  it("steps through the units", () => {
    expect(since(ago(10), now)).toBe("just now");
    expect(since(ago(60 * 12), now)).toBe("12m ago");
    expect(since(ago(3600 * 3), now)).toBe("3h ago");
    expect(since(ago(86400 * 2), now)).toBe("2d ago");
  });

  it("falls back to an absolute date past a week", () => {
    expect(since(ago(86400 * 30), now)).toBe("Aug 13");
  });

  it("never renders a negative age from a clock skew", () => {
    expect(since(Math.floor(now / 1000) + 500, now)).toBe("just now");
  });
});

describe("cap", () => {
  it("capitalizes without throwing on empty input", () => {
    expect(cap("settled")).toBe("Settled");
    expect(cap("")).toBe("");
  });
});

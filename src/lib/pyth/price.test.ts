import { describe, expect, it } from "vitest";
import {
  MAX_AGE_DISPLAY_SECONDS,
  MAX_AGE_SETTLE_SECONDS,
  type Price,
  describeAge,
  parsePriceAccount,
  usable,
} from "./price";

/** Build a PriceUpdateV2 account body with the layout verified against mainnet. */
function account({
  feedId = "2817b78438c769357182c04346fddaad1178c82f4048828fe0997c3c64624e14",
  price = 769_82240000n,
  conf = 20_760000n,
  expo = -8,
  publishedAt = 1_781_755_200,
  verification = 1,
}: Partial<{
  feedId: string;
  price: bigint;
  conf: bigint;
  expo: number;
  publishedAt: number;
  verification: number;
}> = {}): Uint8Array {
  const extra = verification === 1 ? 0 : 1;
  const buf = new Uint8Array(134 + extra);
  const view = new DataView(buf.buffer);
  buf[40] = verification;
  const base = 41 + extra;
  for (let i = 0; i < 32; i += 1) {
    buf[base + i] = Number.parseInt(feedId.slice(i * 2, i * 2 + 2), 16);
  }
  view.setBigInt64(base + 32, price, true);
  view.setBigUint64(base + 40, conf, true);
  view.setInt32(base + 48, expo, true);
  view.setBigInt64(base + 52, BigInt(publishedAt), true);
  return buf;
}

describe("parsePriceAccount", () => {
  it("reads the live SPYX/USD shape into 6-decimal USD", () => {
    // $769.8224 at exponent -8 — the real numbers, read off mainnet 2026-09-12.
    const o = parsePriceAccount(account());
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.base).toBe(769_822400n); // $769.8224 in 6dp
    expect(o.value.confBase).toBe(207600n);
    expect(o.value.feedId.startsWith("2817b784")).toBe(true);
  });

  it("reads a Partial verification, which shifts every field by a byte", () => {
    // Assuming Full and finding Partial would misread the price by one byte's worth of
    // shift, which is not a small error — it is a different number entirely.
    const o = parsePriceAccount(account({ verification: 0 }));
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.base).toBe(769_822400n);
  });

  it("holds on a truncated account rather than reading past the end", () => {
    expect(parsePriceAccount(new Uint8Array(40)).ok).toBe(false);
    expect(parsePriceAccount(account().subarray(0, 90)).ok).toBe(false);
  });

  it("holds on a non-positive price", () => {
    expect(parsePriceAccount(account({ price: 0n })).ok).toBe(false);
    expect(parsePriceAccount(account({ price: -1n })).ok).toBe(false);
  });

  it("holds on an exponent no Pyth feed uses", () => {
    // A positive or absurd exponent is a misread of the layout, not a price.
    expect(parsePriceAccount(account({ expo: 2 })).ok).toBe(false);
    expect(parsePriceAccount(account({ expo: -30 })).ok).toBe(false);
  });
});

const price = (over: Partial<Price> = {}): Price => ({
  feedId: "2817",
  base: 769_822400n,
  confBase: 207600n,
  publishedAt: 1_000_000,
  ...over,
});

describe("usable — two questions, two answers", () => {
  const now = 1_000_000;

  it("lets a fresh price do either job", () => {
    expect(usable(price(), "settle", now + 10).ok).toBe(true);
    expect(usable(price(), "display", now + 10).ok).toBe(true);
  });

  it("refuses to move money against a price older than a minute", () => {
    const o = usable(price(), "settle", now + MAX_AGE_SETTLE_SECONDS + 1);
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/too old to move money against/);
  });

  it("still SHOWS that same price, with its age", () => {
    // Measured on mainnet: the gold feed was nine hours old on a Saturday and the equity feed
    // six. A book that blanks every weekend is not more honest than one that says how old its
    // numbers are — it is just less useful, and it hides the same fact.
    const nineHours = now + 9 * 3600;
    expect(usable(price(), "display", nineHours).ok).toBe(true);
    expect(usable(price(), "settle", nineHours).ok).toBe(false);
  });

  it("takes a per-feed settle bound, because the feeds do not behave alike", () => {
    // The metal feed sits out the weekend and the stablecoin feed does not. One bound would
    // be wrong for one of them, in one direction or the other.
    const nineHours = now + 9 * 3600;
    expect(usable(price(), "settle", nineHours, 26 * 3600).ok).toBe(true);
    expect(usable(price(), "settle", nineHours, 300).ok).toBe(false);
  });

  it("stops showing a price once the feed is not merely shut but abandoned", () => {
    expect(usable(price(), "display", now + MAX_AGE_DISPLAY_SECONDS - 1).ok).toBe(true);
    const o = usable(price(), "display", now + MAX_AGE_DISPLAY_SECONDS + 1);
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/too old to show/);
  });

  it("refuses a price stamped in the future", () => {
    expect(usable(price(), "display", now - 3600).ok).toBe(false);
  });

  it("tolerates a second of clock skew rather than blanking a book over it", () => {
    expect(usable(price(), "display", now - 5).ok).toBe(true);
  });

  it("refuses to settle against a price under stress", () => {
    // A confidence band this wide is a feed mid-halt or an asset with no real market.
    const wide = price({ confBase: 769_822400n / 20n }); // ±5%
    const o = usable(wide, "settle", now);
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/confidence band/);
    // …but it may still be shown, with its age, because it is still the last real price.
    expect(usable(wide, "display", now).ok).toBe(true);
  });
});

describe("describeAge", () => {
  it("reads as a caption, not a log line", () => {
    expect(describeAge(10)).toBe("seconds");
    expect(describeAge(195)).toBe("3 minutes");
    expect(describeAge(33_578)).toBe("9 hours");
    expect(describeAge(60 * 60 * 24 * 5)).toBe("5 days");
  });
});

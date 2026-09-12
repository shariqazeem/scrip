import { describe, expect, it } from "vitest";
import { formatDecimal } from "@/lib/money";
import {
  MAX_SNAPSHOT_AGE_SECONDS,
  type MultiplierSnapshot,
  multiplierInForce,
  noMultiplier,
} from "./multiplier";

/**
 * The live SPYx mint, read on mainnet 2026-09-12. Every timing case below is built on the
 * real numbers rather than invented ones, so a test that passes here is a statement about
 * the actual asset the product holds.
 */
const SPYX_EFFECTIVE = 1_781_755_200; // 2026-06-18T04:00:00Z
const OLD = "1.003909240011759";
const NEW = "1.005714560286254";

const snap = (over: Partial<MultiplierSnapshot> = {}): MultiplierSnapshot => ({
  mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
  multiplier: OLD,
  newMultiplier: NEW,
  effectiveAt: SPYX_EFFECTIVE,
  seenAt: SPYX_EFFECTIVE + 100,
  ...over,
});

describe("which multiplier is live", () => {
  it("uses newMultiplier once its timestamp has passed", () => {
    // THE BUG THIS EXISTS TO PREVENT: reading the field literally named `multiplier` gives
    // 1.003909…, which on 2026-09-12 was three months stale and paints every SPYx balance
    // 0.18% short with nothing about the reading looking wrong.
    const o = multiplierInForce(snap({ seenAt: SPYX_EFFECTIVE + 100 }), SPYX_EFFECTIVE + 200);
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.raw).toBe(NEW);
    expect(o.value.pending).toBeNull();
  });

  it("uses the older value while the change is still pending, and says what is coming", () => {
    const before = SPYX_EFFECTIVE - 86_400;
    const o = multiplierInForce(snap({ seenAt: before }), before + 60);
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.raw).toBe(OLD);
    expect(o.value.pending?.raw).toBe(NEW);
    expect(o.value.pending?.effectiveAt).toBe(SPYX_EFFECTIVE);
  });

  it("switches over at the exact second the issuer named, not a second before", () => {
    const s = snap({ seenAt: SPYX_EFFECTIVE - 10 });
    const justBefore = multiplierInForce(s, SPYX_EFFECTIVE - 1);
    const atTheSecond = multiplierInForce(s, SPYX_EFFECTIVE);
    expect(justBefore.ok && justBefore.value.raw).toBe(OLD);
    expect(atTheSecond.ok && atTheSecond.value.raw).toBe(NEW);
  });

  it("values correctly THROUGH an activation from a snapshot taken before it", () => {
    // Both values are published in advance, which is why an older snapshot is still usable
    // across the change it already knows about. This is the property that lets the watcher
    // poll on a sane interval instead of racing a timestamp.
    const s = snap({ seenAt: SPYX_EFFECTIVE - 600 });
    const before = multiplierInForce(s, SPYX_EFFECTIVE - 300);
    const after = multiplierInForce(s, SPYX_EFFECTIVE + 300);
    expect(before.ok && before.value.raw).toBe(OLD);
    expect(after.ok && after.value.raw).toBe(NEW);
  });

  it("reports no pending change when the two values are identical", () => {
    // GLDx and SLVx both read multiplier = newMultiplier = "1" on mainnet. That is not a
    // pending corporate action, it is an untouched extension.
    const o = multiplierInForce(
      snap({ multiplier: "1", newMultiplier: "1", effectiveAt: 0, seenAt: 1_000 }),
      1_100,
    );
    expect(o.ok).toBe(true);
    if (!o.ok) return;
    expect(o.value.raw).toBe("1");
    expect(o.value.pending).toBeNull();
  });
});

describe("a stale or impossible feed holds rather than guessing", () => {
  it("holds on a snapshot older than the maximum age, and says how old", () => {
    const now = SPYX_EFFECTIVE + MAX_SNAPSHOT_AGE_SECONDS + 601;
    const o = multiplierInForce(snap({ seenAt: SPYX_EFFECTIVE }), now);
    expect(o.ok).toBe(false);
    if (o.ok) return;
    // The sentence has to be readable by a person, not only logged.
    expect(o.why).toMatch(/last read \d+ minutes ago/);
  });

  it("holds on a snapshot dated in the future", () => {
    const o = multiplierInForce(snap({ seenAt: 2_000 }), 1_000);
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/future/);
  });

  it("refuses to zero a balance on one bad read", () => {
    const o = multiplierInForce(snap({ newMultiplier: "0" }), SPYX_EFFECTIVE + 200);
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/zero a balance/);
  });

  it("refuses an unparseable multiplier rather than coercing it", () => {
    for (const bad of ["", "1e-3", "abc", "-1"]) {
      expect(multiplierInForce(snap({ multiplier: bad }), SPYX_EFFECTIVE + 200).ok).toBe(false);
    }
  });

  it("holds on a step no real corporate action makes", () => {
    // 4-for-1 is 4x and a 1-for-10 reverse split is 0.1x. A 1000x step is a corrupt read,
    // and a corrupt read must never rewrite every balance on the book.
    const o = multiplierInForce(snap({ multiplier: "1", newMultiplier: "1000" }), SPYX_EFFECTIVE + 200);
    expect(o.ok).toBe(false);
    if (o.ok) return;
    expect(o.why).toMatch(/outside anything a real corporate action does/);
  });

  it("accepts the real corporate actions at the edges of the band", () => {
    const at = SPYX_EFFECTIVE + 200;
    // a 4-for-1 split
    expect(multiplierInForce(snap({ multiplier: "1", newMultiplier: "4" }), at).ok).toBe(true);
    // a 1-for-10 reverse split
    expect(multiplierInForce(snap({ multiplier: "1", newMultiplier: "0.1" }), at).ok).toBe(true);
  });
});

describe("a mint with no extension", () => {
  it("is a multiplier of exactly one", () => {
    // Oro GOLD is a plain SPL mint. It has no ScaledUiAmount and never will.
    expect(formatDecimal(noMultiplier().value)).toBe("1");
    expect(noMultiplier().pending).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { type CohortRow, dueForMeasurement, keepRate, matured } from "./keep-rate";

const DAY = 86_400;
const NOW = 1_800_000_000;
const usd = (n: number) => BigInt(Math.round(n * 1e6));

const cohort = (over: Partial<CohortRow> = {}): CohortRow => ({
  recipient: "rec1",
  releaseId: "rel1",
  valueAtReleaseBase: usd(100),
  releasedAt: NOW - 40 * DAY,
  valueNowBase: usd(100),
  measuredAt: NOW - DAY,
  ...over,
});

describe("maturity", () => {
  it("counts only payouts at least thirty days old", () => {
    const rows = [
      cohort({ recipient: "old", releasedAt: NOW - 31 * DAY }),
      cohort({ recipient: "young", releasedAt: NOW - 29 * DAY }),
    ];
    expect(matured(rows, NOW).map((r) => r.recipient)).toEqual(["old"]);
  });
});

describe("keepRate", () => {
  it("reports the share of released value still held", () => {
    const r = keepRate(
      [
        cohort({ recipient: "a", valueAtReleaseBase: usd(100), valueNowBase: usd(100) }),
        cohort({ recipient: "b", valueAtReleaseBase: usd(100), valueNowBase: usd(60) }),
      ],
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.bps).toBe(8000); // 80%
    expect(r.value.cohorts).toBe(2);
    expect(r.value.windowDays).toBe(30);
  });

  it("does NOT cap at 100%, because gold rising is the product working", () => {
    // Clamping would hide the asset doing exactly what the product says it does: a recipient
    // who spent nothing can hold more than they were given.
    const r = keepRate([cohort({ valueAtReleaseBase: usd(100), valueNowBase: usd(118) })], NOW);
    expect(r.ok && r.value.bps).toBe(11_800);
  });

  it("holds before any payout has matured, and says when the figure appears", () => {
    // A keep-rate quoted at day three is not a keep-rate.
    const r = keepRate([cohort({ releasedAt: NOW - 3 * DAY })], NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/No payout is 30 days old yet/);
  });

  it("holds when a matured cohort was never measured, rather than counting it as zero", () => {
    /**
     * "They spent it all" and "we did not look" are opposite claims, and conflating them
     * moves the number in the safest possible direction for whoever is quoting it. This is
     * the single easiest way a growth metric becomes a lie, so it is refused outright.
     */
    const r = keepRate(
      [
        cohort({ recipient: "measured", valueNowBase: usd(90) }),
        cohort({ recipient: "not-measured", valueNowBase: null, measuredAt: null }),
      ],
      NOW,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/1 of 2 matured payouts have not been measured/);
  });

  it("holds when nothing matured has been measured at all", () => {
    const r = keepRate([cohort({ valueNowBase: null, measuredAt: null })], NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/none has been measured/);
  });

  it("holds on cohorts released with no value", () => {
    expect(keepRate([cohort({ valueAtReleaseBase: 0n })], NOW).ok).toBe(false);
  });

  it("ignores cohorts that have not matured when computing the rate", () => {
    const r = keepRate(
      [
        cohort({ recipient: "mature", valueAtReleaseBase: usd(100), valueNowBase: usd(50) }),
        cohort({
          recipient: "fresh",
          releasedAt: NOW - DAY,
          valueAtReleaseBase: usd(900),
          valueNowBase: usd(900),
        }),
      ],
      NOW,
    );
    // A day-old payout at 100% would drag the reported figure to 95%. It is not in the window.
    expect(r.ok && r.value.bps).toBe(5000);
    expect(r.ok && r.value.cohorts).toBe(1);
  });
});

describe("dueForMeasurement", () => {
  it("names matured cohorts that have never been measured", () => {
    const rows = [
      cohort({ recipient: "never", valueNowBase: null, measuredAt: null }),
      cohort({ recipient: "recent", measuredAt: NOW - DAY }),
      cohort({ recipient: "young", releasedAt: NOW - 2 * DAY }),
    ];
    expect(dueForMeasurement(rows, NOW).map((r) => r.recipient)).toEqual(["never"]);
  });

  it("re-measures a cohort last measured before it matured", () => {
    // A balance read on day two says nothing about what is held on day thirty.
    const stale = cohort({ recipient: "stale", measuredAt: NOW - 35 * DAY });
    expect(dueForMeasurement([stale], NOW).map((r) => r.recipient)).toEqual(["stale"]);
  });
});

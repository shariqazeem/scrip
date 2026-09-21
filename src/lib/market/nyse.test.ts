import { describe, expect, it } from "vitest";
import { newYork, nyseSession } from "./nyse";

const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("the NYSE session clock", () => {
  it("is open on a Tuesday afternoon in New York", () => {
    // 2026-09-15 14:00 ET is 18:00 UTC (EDT).
    const s = nyseSession(at("2026-09-15T18:00:00Z"));
    expect(s.open).toBe(true);
    expect(s.line).toBe("NYSE open, closes 16:00 ET");
    expect(s.until).toBe(2 * 3600);
  });
  it("is closed before the bell and says when it opens", () => {
    const s = nyseSession(at("2026-09-15T12:00:00Z")); // 08:00 ET
    expect(s.open).toBe(false);
    expect(s.line).toBe("NYSE closed, reopens today 09:30 ET");
    expect(s.until).toBe(90 * 60);
  });
  it("is closed on a Sunday and reopens Monday", () => {
    const s = nyseSession(at("2026-09-20T07:12:00Z")); // Sun 03:12 ET
    expect(s.open).toBe(false);
    expect(s.line).toBe("NYSE closed, reopens tomorrow 09:30 ET");
  });
  it("skips Labor Day", () => {
    const s = nyseSession(at("2026-09-05T20:00:00Z")); // Sat
    expect(s.line).toBe("NYSE closed, reopens Tue 09:30 ET");
  });
  it("knows the early close the day after Thanksgiving", () => {
    const s = nyseSession(at("2026-11-27T17:30:00Z")); // 12:30 ET
    expect(s.open).toBe(true);
    expect(s.line).toBe("NYSE open, closes 13:00 ET");
  });
  it("reads the New York clock across the DST boundary", () => {
    expect(newYork(at("2026-12-15T15:00:00Z")).minutes).toBe(10 * 60); // EST
    expect(newYork(at("2026-07-15T15:00:00Z")).minutes).toBe(11 * 60); // EDT
  });
});

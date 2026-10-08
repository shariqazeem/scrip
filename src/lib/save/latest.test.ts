// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sweepPreference } from "./latest";

const TEAM_WALLET = "6mCBiCNNpaN8roM3HDJazNtceKEkTbWQzep71ae9fKDE";
const STRANGER = "64fcNUtAAockLpMJZ1DudHCMHJhLRBmgrmGvbrwmQzQw";
const sweep = (recipient: string, landedAt: number | null, settledUnix = 1_000_000) => ({
  recipient,
  settledUnix,
  attributedJson: JSON.stringify(landedAt === null ? [] : [{ from: "x", usdc: "1", sig: "s", at: landedAt }]),
});

describe("the receipt the front door features", () => {
  it("prefers what became stock within a minute, a stranger's first, and never an 87-minute one while a faster exists", () => {
    const fastStranger = sweep(STRANGER, 1_000_000 - 12);
    const fastTeam = sweep(TEAM_WALLET, 1_000_000 - 10);
    const slowStranger = sweep(STRANGER, 1_000_000 - 300);
    const bugMorning = sweep(TEAM_WALLET, 1_000_000 - 5_269);
    const unknown = sweep(STRANGER, null);
    const order = [bugMorning, unknown, slowStranger, fastTeam, fastStranger].sort((a, b) => sweepPreference(a) - sweepPreference(b));
    expect(order).toEqual([fastStranger, fastTeam, slowStranger, unknown, bugMorning]);
  });

  it("reads a broken attribution as unknown rather than failing", () => {
    expect(sweepPreference({ recipient: STRANGER, settledUnix: 1, attributedJson: "not json" })).toBe(4);
  });
});

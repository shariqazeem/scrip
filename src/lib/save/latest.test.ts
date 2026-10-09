// @vitest-environment node
import { describe, expect, it } from "vitest";
import { frontRank, sweepPreference } from "./latest";

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

describe("which receipt leads the front door, across saves and automatic saves", () => {
  const save = (owner: string, settledUnix = 1_000_000) => ({ kind: "save" as const, owner, settledUnix });
  const auto = (recipient: string, landedAt: number | null) => ({ kind: "sweep" as const, ...sweep(recipient, landedAt) });
  const pick = (cs: Array<Parameters<typeof frontRank>[0]>) => [...cs].sort((a, b) => frontRank(a) - frontRank(b))[0];

  it("keeps the team's ten-second automatic save over the team's own $5 test save", () => {
    const fast = auto(TEAM_WALLET, 1_000_000 - 10);
    expect(pick([save(TEAM_WALLET, 2_000_000), fast])).toBe(fast);
  });

  it("leads with an automatic save, the product, over any save made by hand", () => {
    const fastTeam = auto(TEAM_WALLET, 1_000_000 - 10);
    expect(pick([save(STRANGER, 2_000_000), fastTeam])).toBe(fastTeam);
    const slowStranger = auto(STRANGER, 1_000_000 - 300);
    expect(pick([save(STRANGER, 2_000_000), slowStranger])).toBe(slowStranger);
  });

  it("puts a stranger's fast automatic save ahead of the team's", () => {
    const fast = auto(STRANGER, 1_000_000 - 12);
    expect(pick([auto(TEAM_WALLET, 1_000_000 - 9), fast])).toBe(fast);
  });

  it("puts a stranger's save ahead of the team's, when there is no automatic save to show", () => {
    const theirs = save(STRANGER, 1_000_000);
    expect(pick([save(TEAM_WALLET, 2_000_000), theirs])).toBe(theirs);
  });

  it("prefers a save to an automatic save that took an hour", () => {
    const theirs = save(TEAM_WALLET);
    expect(pick([auto(TEAM_WALLET, 1_000_000 - 5_269), theirs])).toBe(theirs);
  });
});

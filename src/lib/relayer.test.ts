// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { sponsorsPayer } = await import("./relayer");

const SCRIP = "BbDN31Q4qK53ddNuJnvpvWfC5UFMi87HGxQmuJobUv3q";
const FOUNDER = "EsWeMEvuLDV2Q4CXigZbETzqXfEQwZntQjwD4Cy8AgY5";
const STRANGER = "CGRv3QJTLbcYKCN9R4hNqN1pt5vEBqWY9MLNxSKu13aA";

describe("sponsorsPayer", () => {
  it("sponsors every payer when no list is set — a local or devnet deployment", () => {
    expect(sponsorsPayer(STRANGER, undefined)).toBe(true);
    expect(sponsorsPayer(STRANGER, "")).toBe(true);
    expect(sponsorsPayer(STRANGER, " , ")).toBe(true);
  });
  it("sponsors only the listed payers when a list is set", () => {
    const list = ` ${SCRIP}, ${FOUNDER} `;
    expect(sponsorsPayer(SCRIP, list)).toBe(true);
    expect(sponsorsPayer(FOUNDER, list)).toBe(true);
    expect(sponsorsPayer(STRANGER, list)).toBe(false);
  });
  it("never sponsors a missing payer when a list is set", () => {
    expect(sponsorsPayer(null, SCRIP)).toBe(false);
    expect(sponsorsPayer(undefined, SCRIP)).toBe(false);
    expect(sponsorsPayer("", SCRIP)).toBe(false);
  });
});

describe("claimsSponsored", () => {
  it("is on unless SPONSOR_CLAIMS says off", async () => {
    const { claimsSponsored } = await import("./relayer");
    expect(claimsSponsored(undefined)).toBe(true);
    expect(claimsSponsored("on")).toBe(true);
    expect(claimsSponsored("off")).toBe(false);
    expect(claimsSponsored(" OFF ")).toBe(false);
  });
  it("switched off, no payer is sponsored — not even a listed one", async () => {
    const prev = process.env.SPONSOR_CLAIMS;
    process.env.SPONSOR_CLAIMS = "off";
    try {
      expect(sponsorsPayer(SCRIP, SCRIP)).toBe(false);
      expect(sponsorsPayer(SCRIP, undefined)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.SPONSOR_CLAIMS;
      else process.env.SPONSOR_CLAIMS = prev;
    }
  });
});

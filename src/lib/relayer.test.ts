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

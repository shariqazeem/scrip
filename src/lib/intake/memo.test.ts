import { describe, expect, it } from "vitest";
import { MAX_REASON_LEN, reasonHash, reasonHashHex, reasonMatches, validateReason } from "./memo";

describe("reasonHash", () => {
  it("is sha256 of the UTF-8 bytes, and zero for an empty reason", () => {
    // sha256("abc")
    expect(reasonHashHex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(reasonHashHex("")).toBe("0".repeat(64));
    expect(reasonHash("shipped the receipt page on Tuesday").length).toBe(32);
  });

  it("matches a memo to the hash on a receipt, and nothing else", () => {
    const h = reasonHash("a month of work");
    expect(reasonMatches("a month of work", h)).toBe(true);
    expect(reasonMatches("a month of work ", h)).toBe(false);
    expect(reasonMatches("A month of work", h)).toBe(false);
  });
});

describe("validateReason", () => {
  it("collapses whitespace and trims", () => {
    const r = validateReason("  a   month\nof work ");
    expect(r.ok && r.value).toBe("a month of work");
  });
  it("allows an empty reason", () => {
    expect(validateReason("").ok).toBe(true);
  });
  it("refuses more than the memo the program sizes for", () => {
    expect(validateReason("x".repeat(MAX_REASON_LEN)).ok).toBe(true);
    expect(validateReason("x".repeat(MAX_REASON_LEN + 1)).ok).toBe(false);
  });
  it("refuses control characters", () => {
    expect(validateReason("ab").ok).toBe(false);
  });
});

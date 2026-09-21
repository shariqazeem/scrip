import { describe, expect, it } from "vitest";
import { signInMessage } from "./message";

/**
 * The wallet is the judge of this format, and it judges strictly. These assertions are the
 * parts of EIP-4361 that a wallet refuses over, written down so nobody reflows the copy and
 * quietly breaks sign-in on every wallet at once.
 */
const PUBKEY = "EsWeMEvuLDV2Q4CXigZbETzqXfEQwZntQjwD4Cy8AgY5";
const msg = signInMessage(PUBKEY, "0123456789abcdef0123456789abcdef", "2026-09-21T14:00:00.000Z");
const lines = msg.split("\n");

describe("the sign-in message is a legal SIWS message", () => {
  it("opens with the domain and the address", () => {
    expect(lines[0]).toMatch(/ wants you to sign in with your Solana account:$/);
    expect(lines[1]).toBe(PUBKEY);
    expect(lines[2]).toBe("");
  });

  it("has a statement of exactly one line, between two blank lines", () => {
    // The bug: this was wrapped across two lines, which is not a legal statement, and
    // Phantom answered "cannot be shown due to invalid formatting".
    expect(lines[3]).not.toBe("");
    expect(lines[3]).not.toContain("\n");
    expect(lines[4]).toBe("");
  });

  it("carries every labelled field a parser looks for, each once", () => {
    for (const k of ["URI: ", "Version: ", "Nonce: ", "Issued At: "]) {
      expect(lines.filter((l) => l.startsWith(k))).toHaveLength(1);
    }
    expect(lines[lines.indexOf(lines.find((l) => l.startsWith("Version: "))!)]).toBe("Version: 1");
  });

  it("still says, in the popup itself, that nothing moves", () => {
    expect(msg).toContain("costs nothing");
    expect(msg).toContain("authorises no transaction");
  });

  it("says register, the word a person reads everywhere else, not book", () => {
    expect(msg).toContain("register");
    expect(msg).not.toMatch(/\bbook\b/i);
  });
});

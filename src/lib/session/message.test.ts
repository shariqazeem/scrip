import { describe, expect, it } from "vitest";
import { signInMessage, signInTextMatches } from "./message";

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

  it("says savings, the word a person reads everywhere else, never book or register", () => {
    expect(msg).toContain("Scrip savings");
    expect(msg).not.toMatch(/\bbook\b|\bregister\b/i);
  });
});

describe("a sign-in the wallet wrote itself", () => {
  const NONCE = "0123456789abcdef0123456789abcdef";
  const AT = "2026-09-21T14:00:00.000Z";
  const expect_ = { pubkey: PUBKEY, nonce: NONCE, issuedAt: AT };
  const withLine = (after: string, line: string) => {
    const l = msg.split("\n");
    l.splice(l.findIndex((x) => x.startsWith(after)) + 1, 0, line);
    return l.join("\n");
  };

  it("is accepted when it is ours, byte for byte, or ours with a Solana chain id added", () => {
    expect(signInTextMatches(msg, expect_)).toBe(true);
    expect(signInTextMatches(withLine("Version: ", "Chain ID: solana:mainnet"), expect_)).toBe(true);
    expect(signInTextMatches(withLine("Version: ", "Chain ID: mainnet"), expect_)).toBe(true);
  });

  it("is refused for another nonce, another time, another address or another site", () => {
    expect(signInTextMatches(msg, { ...expect_, nonce: "f".repeat(32) })).toBe(false);
    expect(signInTextMatches(msg, { ...expect_, issuedAt: "2026-09-21T14:05:00.000Z" })).toBe(false);
    expect(signInTextMatches(msg, { ...expect_, pubkey: "11111111111111111111111111111111" })).toBe(false);
    expect(signInTextMatches(msg.replace(/^[^ ]+ wants/, "evil.example wants"), expect_)).toBe(false);
  });

  it("is refused with any field we did not ask for, a field missing, or one given twice", () => {
    expect(signInTextMatches(withLine("Issued At: ", "Expiration Time: 2099-01-01T00:00:00.000Z"), expect_)).toBe(false);
    expect(signInTextMatches(withLine("Version: ", "Chain ID: ethereum:1"), expect_)).toBe(false);
    expect(signInTextMatches(msg.split("\n").filter((l) => !l.startsWith("Nonce: ")).join("\n"), expect_)).toBe(false);
    expect(signInTextMatches(withLine("Nonce: ", `Nonce: ${NONCE}`), expect_)).toBe(false);
    expect(signInTextMatches(msg.replace("costs nothing", "costs everything"), expect_)).toBe(false);
  });
});

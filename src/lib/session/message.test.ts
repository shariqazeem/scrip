import { describe, expect, it } from "vitest";
import { signInMessage, signInTextCarries, signInTextMatches } from "./message";

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

describe("a sign-in another wallet worded its own way", () => {
  const NONCE = "0123456789abcdef0123456789abcdef";
  const AT = "2026-09-21T14:00:00.000Z";
  const NOW = Math.floor(Date.parse(AT) / 1000) + 30;
  const at = (l: string[]) => l.join("\n");
  const base = msg.split("\n");
  const domainLine = base[0]!;
  const uriLine = base.find((l) => l.startsWith("URI: "))!;

  it("is accepted when only the wording differs: no statement, another time format, its own fields", () => {
    const solflareLike = at([domainLine, PUBKEY, "", uriLine, "Version: 1", "Chain ID: solana:mainnet", `Nonce: ${NONCE}`, "Issued At: 2026-09-21T14:00:00Z", "Expiration Time: 2026-09-21T14:10:00Z"]);
    expect(signInTextMatches(solflareLike, { pubkey: PUBKEY, nonce: NONCE, issuedAt: AT })).toBe(false);
    expect(signInTextCarries(solflareLike, { pubkey: PUBKEY, nonce: NONCE }, NOW)).toBe(true);
    expect(signInTextCarries(at([...base.map((l) => (l.startsWith("URI: ") ? `${l}/` : l))]), { pubkey: PUBKEY, nonce: NONCE }, NOW)).toBe(true);
  });

  it("is still refused for another site, another address, another nonce or no nonce", () => {
    expect(signInTextCarries(msg.replace(/^[^ ]+ wants/, "evil.example wants"), { pubkey: PUBKEY, nonce: NONCE }, NOW)).toBe(false);
    expect(signInTextCarries(msg, { pubkey: "11111111111111111111111111111111", nonce: NONCE }, NOW)).toBe(false);
    expect(signInTextCarries(msg, { pubkey: PUBKEY, nonce: "f".repeat(32) }, NOW)).toBe(false);
    expect(signInTextCarries(at(base.filter((l) => !l.startsWith("Nonce: "))), { pubkey: PUBKEY, nonce: NONCE }, NOW)).toBe(false);
  });

  it("is refused when it points at another URI, is stale, or names another chain", () => {
    const swap = (from: string, to: string) => at(base.map((l) => (l.startsWith(from) ? to : l)));
    expect(signInTextCarries(swap("URI: ", "URI: https://evil.example"), { pubkey: PUBKEY, nonce: NONCE }, NOW)).toBe(false);
    expect(signInTextCarries(msg, { pubkey: PUBKEY, nonce: NONCE }, NOW + 3_600)).toBe(false);
    expect(signInTextCarries(swap("Version: ", "Version: 1\nChain ID: ethereum:1"), { pubkey: PUBKEY, nonce: NONCE }, NOW)).toBe(false);
  });
});

/** @vitest-environment node */
import { beforeAll, describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS, issueSessionToken, readSessionToken } from "./token";

beforeAll(() => {
  process.env.WEBGOLD_SESSION_SECRET = "test-secret-for-this-file-only";
});

const OWNER = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const NOW = 1_800_000_000;

describe("the session cookie", () => {
  it("round-trips an owner", () => {
    expect(readSessionToken(issueSessionToken(OWNER, NOW), NOW + 10)).toBe(OWNER);
  });

  it("expires", () => {
    const token = issueSessionToken(OWNER, NOW);
    expect(readSessionToken(token, NOW + SESSION_TTL_SECONDS - 1)).toBe(OWNER);
    expect(readSessionToken(token, NOW + SESSION_TTL_SECONDS + 1)).toBeNull();
  });

  it("refuses a forged owner", () => {
    // The whole point: a cookie is not a claim, it is a signed claim. Swapping the owner
    // while keeping the signature must not silently hand over somebody else's book.
    const token = issueSessionToken(OWNER, NOW);
    const [, expiry, mac] = token.split(".");
    expect(readSessionToken(`SomeoneElse.${expiry}.${mac}`, NOW + 10)).toBeNull();
  });

  it("refuses a stretched expiry", () => {
    const token = issueSessionToken(OWNER, NOW);
    const [owner, , mac] = token.split(".");
    expect(readSessionToken(`${owner}.${NOW + 99_999_999}.${mac}`, NOW + 10)).toBeNull();
  });

  it("never throws on a malformed cookie — it is simply not a session", () => {
    for (const bad of [undefined, "", "a", "a.b", "a.b.c.d", "..", "x.notanumber.y"]) {
      expect(readSessionToken(bad, NOW)).toBeNull();
    }
  });

  it("refuses a signature of the wrong length without a timing leak", () => {
    // timingSafeEqual throws on differing lengths, which would turn a malformed cookie into
    // a 500. Length is checked first, and the comparison itself is constant-time.
    const token = issueSessionToken(OWNER, NOW);
    const [owner, expiry] = token.split(".");
    expect(readSessionToken(`${owner}.${expiry}.short`, NOW)).toBeNull();
  });
});

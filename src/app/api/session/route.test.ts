/** @vitest-environment node */
import { Keypair, PublicKey } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { signInMessage } from "@/lib/session/message";
import { NONCE_COOKIE, SESSION_COOKIE, readSessionToken } from "@/lib/session/token";
import { DELETE, POST } from "./route";

beforeAll(() => {
  process.env.SCRIP_SESSION_SECRET = "test-secret-for-this-file-only";
});

const NONCE = "0123456789abcdef0123456789abcdef";
const owner = Keypair.generate();

function sign(
  keypair: Keypair,
  pubkey: string,
  nonce: string,
  issuedAt: string,
): string {
  const msg = new TextEncoder().encode(signInMessage(pubkey, nonce, issuedAt));
  return Buffer.from(ed25519.sign(msg, keypair.secretKey.slice(0, 32))).toString("base64");
}

function request(body: unknown, nonceCookie: string | null = NONCE): NextRequest {
  const req = new NextRequest("http://localhost:3000/api/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(nonceCookie ? { cookie: `${NONCE_COOKIE}=${nonceCookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return req;
}

function goodBody(issuedAt = new Date().toISOString()) {
  const pubkey = owner.publicKey.toBase58();
  return { pubkey, signature: sign(owner, pubkey, NONCE, issuedAt), nonce: NONCE, issuedAt };
}

describe("signing in with a Solana wallet", () => {
  it("accepts a signature over the message the server rebuilds", async () => {
    const res = await POST(request(goodBody()));
    expect(res.status).toBe(200);
    const cookie = res.cookies.get(SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(readSessionToken(cookie!.value, Math.floor(Date.now() / 1000))).toBe(
      owner.publicKey.toBase58(),
    );
    expect(cookie!.httpOnly).toBe(true);
  });

  it("spends the nonce, so the same signature cannot be replayed", async () => {
    // Without this, a signature captured anywhere stays valid forever and "prove you own this
    // wallet" degrades to "show me any proof you ever made".
    const body = goodBody();
    expect((await POST(request(body))).status).toBe(200);
    const second = await POST(request(body, null));
    expect(second.status).toBe(401);
  });

  it("refuses a nonce that is not the one we issued", async () => {
    const body = goodBody();
    const res = await POST(request(body, "ffffffffffffffffffffffffffffffff"));
    expect(res.status).toBe(401);
  });

  it("refuses a signature made by a DIFFERENT wallet for this message", async () => {
    // The attack this closes: somebody signs the message with their own key while claiming
    // to be somebody else's address.
    const impostor = Keypair.generate();
    const victim = owner.publicKey.toBase58();
    const issuedAt = new Date().toISOString();
    const res = await POST(
      request({
        pubkey: victim,
        signature: sign(impostor, victim, NONCE, issuedAt),
        nonce: NONCE,
        issuedAt,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses a signature over a DIFFERENT message", async () => {
    // Verifying a signature over whatever the client sent would prove only that the wallet
    // signed something. The server rebuilds the message and compares byte-for-byte.
    const pubkey = owner.publicKey.toBase58();
    const issuedAt = new Date().toISOString();
    const elsewhere = new TextEncoder().encode("evil.example wants you to sign in");
    const res = await POST(
      request({
        pubkey,
        signature: Buffer.from(ed25519.sign(elsewhere, owner.secretKey.slice(0, 32))).toString("base64"),
        nonce: NONCE,
        issuedAt,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses a stale timestamp even with the right nonce", async () => {
    const old = new Date(Date.now() - 3600_000).toISOString();
    expect((await POST(request(goodBody(old)))).status).toBe(401);
  });

  it("refuses an address that is off the ed25519 curve", async () => {
    // A PDA has no private key, so no signature over this message can exist for it. Accepting
    // one would be accepting a signature nobody could have made.
    const [pda] = PublicKey.findProgramAddressSync([Buffer.from("x")], owner.publicKey);
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
    const issuedAt = new Date().toISOString();
    const res = await POST(
      request({
        pubkey: pda.toBase58(),
        signature: sign(owner, pda.toBase58(), NONCE, issuedAt),
        nonce: NONCE,
        issuedAt,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses malformed input without throwing", async () => {
    for (const body of [{}, { pubkey: 1 }, { pubkey: "x", signature: "y", nonce: NONCE, issuedAt: "z" }]) {
      expect((await POST(request(body))).status).toBe(401);
    }
  });

  it("gives one answer for every failure", async () => {
    // A route that says WHICH check failed is an oracle for whoever is probing it.
    const a = await POST(request(goodBody(), "wrongnonce"));
    const b = await POST(request({}, NONCE));
    expect(await a.json()).toEqual(await b.json());
  });
});

describe("signing out", () => {
  it("clears the cookie", async () => {
    const res = await DELETE();
    expect(res.cookies.get(SESSION_COOKIE)?.value).toBe("");
  });
});

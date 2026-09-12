/**
 * @vitest-environment node
 *
 * NODE, NOT JSDOM. `PublicKey.findProgramAddressSync` fails under jsdom with "Unable to find
 * a viable program address nonce" — the hash is computed over bytes from a different realm's
 * Uint8Array, so every candidate bump comes out on-curve. Real browsers are fine; jsdom is
 * the odd one out, and the production path is server-side anyway. Same root cause as the
 * Token-2022 decode in registry.live.test.ts.
 */
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { defaultPolicy } from "@/lib/policy";
import { WEBGOLD_PROGRAM_ID, bookPda } from "@/lib/solana/program";
import { closeBookIx, decodeWebgoldIx, openBookIx, setPolicyIx } from "./instructions";

const owner = Keypair.generate().publicKey;

describe("open_book", () => {
  it("encodes against the committed IDL and round-trips", () => {
    const ix = openBookIx(owner, defaultPolicy());
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;

    const decoded = decodeWebgoldIx(Buffer.from(ix.value.data));
    expect(decoded?.name).toBe("open_book");
    const legs = (decoded?.data as { policy: { legs: Array<{ mint: PublicKey; bps: number }> } })
      .policy.legs;
    expect(legs.map((l) => l.bps)).toEqual(defaultPolicy().legs.map((l) => l.bps));
    expect(legs[0]!.mint.toBase58()).toBe(defaultPolicy().legs[0]!.mint);
  });

  it("names the book PDA, the owner as signer, and the system program", () => {
    const ix = openBookIx(owner, defaultPolicy());
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    expect(ix.value.programId.equals(WEBGOLD_PROGRAM_ID)).toBe(true);
    expect(ix.value.keys[0]!.pubkey.equals(bookPda(owner))).toBe(true);
    expect(ix.value.keys[0]!.isWritable).toBe(true);
    expect(ix.value.keys[1]!.pubkey.equals(owner)).toBe(true);
    expect(ix.value.keys[1]!.isSigner).toBe(true);
    expect(ix.value.keys[2]!.pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("refuses to build a transaction the program would reject", () => {
    // The caller finds out by paying for a failed transaction otherwise. A script that skips
    // the form must hit the same wall the form does.
    const bad = { legs: [{ mint: defaultPolicy().legs[0]!.mint, bps: 9_999 }], driftBps: 0 };
    const ix = openBookIx(owner, bad);
    expect(ix.ok).toBe(false);
    if (ix.ok) return;
    expect(ix.why).toMatch(/99.99%/);
  });
});

describe("set_policy", () => {
  it("does not ask the owner for a writable account — it changes the book, not the wallet", () => {
    const ix = setPolicyIx(owner, defaultPolicy());
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    expect(ix.value.keys[1]!.isSigner).toBe(true);
    expect(ix.value.keys[1]!.isWritable).toBe(false);
    expect(decodeWebgoldIx(Buffer.from(ix.value.data))?.name).toBe("set_policy");
  });

  it("carries a different discriminator from open_book", () => {
    // Two instructions sharing a discriminator would let one be sent where the other was
    // meant. Anchor derives them, and this is the check that they were actually derived.
    const a = openBookIx(owner, defaultPolicy());
    const b = setPolicyIx(owner, defaultPolicy());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.data.subarray(0, 8).equals(b.value.data.subarray(0, 8))).toBe(false);
  });
});

describe("close_book", () => {
  it("returns rent to the owner, so the owner is writable", () => {
    const ix = closeBookIx(owner);
    expect(ix.keys[1]!.isWritable).toBe(true);
    expect(decodeWebgoldIx(Buffer.from(ix.data))?.name).toBe("close_book");
  });
});

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
  it("encodes against the committed IDL and round-trips EVERY field", () => {
    /**
     * THE TEST THAT CAUGHT A SILENT ZERO. Anchor's Borsh coder matches the IDL's own field
     * names and, for a field it cannot find, encodes 0 rather than throwing. Writing
     * `driftBps` — which is what the TypeScript type calls it — sent `drift_bps: 0` on every
     * policy, with no error anywhere, and the program accepted it.
     *
     * So a round-trip assertion is not ceremony here. Every value that goes into an encoder
     * comes back out and is compared, because "it encoded without throwing" means nothing.
     */
    const policy = defaultPolicy();
    const ix = openBookIx(owner, policy);
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;

    const decoded = decodeWebgoldIx(Buffer.from(ix.value.data));
    expect(decoded?.name).toBe("open_book");
    const p = (
      decoded?.data as {
        policy: {
          legs: Array<{ mint: PublicKey; bps: number }>;
          drift_bps: number;
          updated_at: { toString(): string };
        };
      }
    ).policy;
    expect(p.legs.map((l) => l.bps)).toEqual(policy.legs.map((l) => l.bps));
    expect(p.legs.map((l) => l.mint.toBase58())).toEqual(policy.legs.map((l) => l.mint));
    expect(p.drift_bps).toBe(policy.driftBps);
    expect(p.drift_bps).toBeGreaterThan(0);
    // Set by the program from the clock; a caller-chosen timestamp proves nothing.
    expect(p.updated_at.toString()).toBe("0");
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

  it("carries the drift band through, rather than a silent zero", () => {
    const custom = { ...defaultPolicy(), driftBps: 250 };
    const ix = setPolicyIx(owner, custom);
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    const p = (decodeWebgoldIx(Buffer.from(ix.value.data))?.data as {
      policy: { drift_bps: number };
    }).policy;
    expect(p.drift_bps).toBe(250);
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

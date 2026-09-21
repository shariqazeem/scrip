/**
 * @vitest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
  SCRIP_PROGRAM_ID,
  accountDiscriminator,
  bookPda,
  handlePda,
  newReleaseId,
  payoutPda,
  receiptPda,
  releaseIdFromHex,
  toBase58,
  toHex,
} from "./program";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * THREE LISTS THAT DRIFT. The program id is written by three different tools into three
 * different files. A transaction signed against the wrong one is a fee paid to nobody.
 */
describe("the program id agrees everywhere it is written", () => {
  const fromSource = /declare_id!\("([1-9A-HJ-NP-Za-km-z]+)"\)/.exec(read("anchor/programs/scrip/src/lib.rs"))?.[1];
  const fromToml = [...read("anchor/Anchor.toml").matchAll(/scrip = "([1-9A-HJ-NP-Za-km-z]+)"/g)].map((m) => m[1]);

  it("declare_id! matches the committed IDL", () => {
    expect(fromSource).toBe(SCRIP_PROGRAM_ID.toBase58());
  });
  it("Anchor.toml names the same id for every cluster", () => {
    expect(fromToml.length).toBeGreaterThanOrEqual(3);
    for (const id of fromToml) expect(id).toBe(SCRIP_PROGRAM_ID.toBase58());
  });
  it("the committed IDL is the built one", () => {
    // Only meaningful when a build exists locally; skipped otherwise rather than lying.
    const built = join(root, "anchor", "target", "idl", "scrip.json");
    let text: string | null = null;
    try {
      text = readFileSync(built, "utf8");
    } catch {
      return;
    }
    expect(JSON.parse(text)).toEqual(JSON.parse(read("src/lib/anchor/scrip.json")));
  });
});

describe("PDAs", () => {
  const owner = Keypair.generate().publicKey;
  it("one book per owner, derivable by anyone", () => {
    expect(bookPda(owner).equals(bookPda(owner))).toBe(true);
    expect(PublicKey.isOnCurve(bookPda(owner).toBytes())).toBe(false);
  });
  it("a handle is addressed by its slug", () => {
    expect(handlePda("shariq").equals(handlePda("shariq"))).toBe(true);
    expect(handlePda("shariq").equals(handlePda("shariq2"))).toBe(false);
  });
  it("a payout and a receipt need a sixteen-byte release id", () => {
    const rid = newReleaseId();
    expect(rid.length).toBe(16);
    expect(() => payoutPda(owner, new Uint8Array(15))).toThrow();
    expect(() => receiptPda(owner, new Uint8Array(32))).toThrow();
    expect(payoutPda(owner, rid).equals(payoutPda(owner, rid))).toBe(true);
  });
  it("release ids round-trip through hex", () => {
    const rid = newReleaseId();
    const back = releaseIdFromHex(toHex(rid));
    expect(back.ok && toHex(back.value)).toBe(toHex(rid));
    expect(releaseIdFromHex("zz").ok).toBe(false);
  });
});

describe("account discriminators", () => {
  it("are the anchor hash of the account name", async () => {
    const { createHash } = await import("node:crypto");
    for (const name of ["Book", "Handle", "Payout", "Receipt"]) {
      const expected = createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
      expect(Buffer.from(accountDiscriminator(name))).toEqual(expected);
    }
  });
  it("base58 encodes leading zeros", () => {
    expect(toBase58(new Uint8Array([0, 0, 1]))).toBe("112");
  });
});

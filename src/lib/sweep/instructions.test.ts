/**
 * @vitest-environment node
 */
import { Keypair, PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { USDC_MINT, defaultAsset } from "@/lib/assets/registry";
import { bookPda, decodeIx, newReleaseId, receiptPda } from "@/lib/solana/program";
import { beginSweepIx, finishSweepIx } from "./instructions";

const keeper = Keypair.generate().publicKey;
const owner = Keypair.generate().publicKey;
const usdc = new PublicKey(USDC_MINT);
const rid = newReleaseId();
const asset = defaultAsset();

describe("the sweep halves", () => {
  it("both read the book at account index one — the introspection guard depends on it", () => {
    const begin = beginSweepIx({ keeper, owner, usdcMint: usdc, asset, releaseId: rid });
    const finish = finishSweepIx({ keeper, owner, usdcMint: usdc, asset, releaseId: rid, priceUpdate: Keypair.generate().publicKey });
    expect(begin.ok && finish.ok).toBe(true);
    if (!begin.ok || !finish.ok) return;
    expect(begin.value.keys[0]!.pubkey.equals(keeper) && begin.value.keys[0]!.isSigner).toBe(true);
    expect(begin.value.keys[1]!.pubkey.equals(bookPda(owner))).toBe(true);
    expect(finish.value.keys[1]!.pubkey.equals(bookPda(owner))).toBe(true);
    // The release id sits at data[8..24] in both, which is where the guard reads it.
    expect(begin.value.data.subarray(8, 24).equals(Buffer.from(rid))).toBe(true);
    expect(finish.value.data.subarray(8, 24).equals(Buffer.from(rid))).toBe(true);
    expect(finish.value.data.length).toBe(24);
  });

  it("begin names the instructions sysvar and the keeper's USDC account", () => {
    const begin = beginSweepIx({ keeper, owner, usdcMint: usdc, asset, releaseId: rid });
    expect(begin.ok && begin.value.keys.at(-1)!.pubkey.equals(SYSVAR_INSTRUCTIONS_PUBKEY)).toBe(true);
    expect(begin.ok && decodeIx(begin.value.data)?.name).toBe("begin_sweep");
  });

  it("finish writes the receipt under the book", () => {
    const finish = finishSweepIx({ keeper, owner, usdcMint: usdc, asset, releaseId: rid, priceUpdate: Keypair.generate().publicKey });
    expect(finish.ok && finish.value.keys[8]!.pubkey.equals(receiptPda(bookPda(owner), rid))).toBe(true);
  });
});

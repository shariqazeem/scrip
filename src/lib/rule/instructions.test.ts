/**
 * @vitest-environment node
 *
 * NODE, NOT JSDOM. `PublicKey.findProgramAddressSync` fails under jsdom because the hash is
 * computed over bytes from a different realm's Uint8Array.
 */
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { USDC_MINT, defaultAsset } from "@/lib/assets/registry";
import { SCRIP_PROGRAM_ID, bookPda, decodeIx, handlePda } from "@/lib/solana/program";
import {
  disableRuleIxs,
  enableRuleIx,
  enableRuleIxs,
  openBookIx,
  pauseIxs,
  resumeIxs,
  setRuleIx,
  syncWatermarkIx,
  usdcAta,
  withdrawFloatIx,
} from "./instructions";

const owner = Keypair.generate().publicKey;
const usdc = new PublicKey(USDC_MINT);
const terms = { rateBps: 1_000, escalateBps: 100, floorUsdc: 0n, capUsdc: 5_000_000_000n, toleranceBps: 100 };

describe("open_book", () => {
  it("encodes against the IDL and round-trips every field", () => {
    const ix = openBookIx({ owner, slug: "shariq", asset: defaultAsset(), usdcMint: usdc, termsVersion: 1 });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    const d = decodeIx(ix.value.data);
    expect(d?.name).toBe("open_book");
    expect((d?.data as { slug: string; terms_version: number }).slug).toBe("shariq");
    expect((d?.data as { slug: string; terms_version: number }).terms_version).toBe(1);
    expect(ix.value.programId.equals(SCRIP_PROGRAM_ID)).toBe(true);
    // owner, payer, book, handle, asset_mint, usdc_mint, system_program — the IDL's order.
    expect(ix.value.keys[0]!.pubkey.equals(owner) && ix.value.keys[0]!.isSigner).toBe(true);
    expect(ix.value.keys[1]!.pubkey.equals(owner) && ix.value.keys[1]!.isWritable).toBe(true);
    expect(ix.value.keys[2]!.pubkey.equals(bookPda(owner))).toBe(true);
    expect(ix.value.keys[3]!.pubkey.equals(handlePda("shariq"))).toBe(true);
    expect(ix.value.keys[6]!.pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("lets a relayer pay the rent", () => {
    const relayer = Keypair.generate().publicKey;
    const ix = openBookIx({ owner, payer: relayer, slug: "shariq", asset: defaultAsset(), usdcMint: usdc, termsVersion: 1 });
    expect(ix.ok && ix.value.keys[1]!.pubkey.equals(relayer)).toBe(true);
  });

  it("refuses a slug the program would refuse", () => {
    expect(openBookIx({ owner, slug: "Sh", asset: defaultAsset(), usdcMint: usdc, termsVersion: 1 }).ok).toBe(false);
  });
});

describe("enable_rule and set_rule", () => {
  it("round-trip every term, including the u64s, with snake_case names", () => {
    /**
     * THE TEST THAT CATCHES A SILENT ZERO. Anchor's coder encodes 0 for a field name it cannot
     * find. Every value goes in and comes back out here, because "it encoded" means nothing.
     */
    const ix = enableRuleIx(owner, usdc, terms);
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    const d = decodeIx(ix.value.data)?.data as {
      rate_bps: number;
      escalate_bps: number;
      floor_usdc: BN;
      cap_usdc: BN;
      tolerance_bps: number;
    };
    expect(d.rate_bps).toBe(1_000);
    expect(d.escalate_bps).toBe(100);
    expect(d.floor_usdc.toString()).toBe("0");
    expect(d.cap_usdc.toString()).toBe("5000000000");
    expect(d.tolerance_bps).toBe(100);
    // owner, book, usdc_mint, owner_usdc, usdc_program
    expect(ix.value.keys[3]!.pubkey.equals(usdcAta(owner, usdc))).toBe(true);
    expect(ix.value.keys[4]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });

  it("carries different discriminators", () => {
    const a = enableRuleIx(owner, usdc, terms);
    const b = setRuleIx(owner, usdc, terms);
    expect(a.ok && b.ok && !a.value.data.subarray(0, 8).equals(b.value.data.subarray(0, 8))).toBe(true);
  });

  it("refuses terms the program would refuse", () => {
    expect(enableRuleIx(owner, usdc, { ...terms, rateBps: 6_000 }).ok).toBe(false);
    expect(setRuleIx(owner, usdc, { ...terms, toleranceBps: 10 }).ok).toBe(false);
  });
});

describe("the composed transactions put the token-program instruction FIRST", () => {
  it("enable: approve, float, enable_rule", () => {
    const ixs = enableRuleIxs({ owner, usdcMint: usdc, terms, allowanceUsdc: 1_000_000_000n, floatLamports: 50_000_000n });
    expect(ixs.ok).toBe(true);
    if (!ixs.ok) return;
    expect(ixs.value.map((i) => i.programId.toBase58())).toEqual([
      TOKEN_PROGRAM_ID.toBase58(),
      SystemProgram.programId.toBase58(),
      SCRIP_PROGRAM_ID.toBase58(),
    ]);
    // The approve names the Book as delegate.
    expect(ixs.value[0]!.keys.some((k) => k.pubkey.equals(bookPda(owner)))).toBe(true);
    // The float goes to the Book.
    expect(ixs.value[1]!.keys[1]!.pubkey.equals(bookPda(owner))).toBe(true);
    expect(decodeIx(ixs.value[2]!.data)?.name).toBe("enable_rule");
  });

  it("pause is a revoke and nothing else — the program is not in it", () => {
    const ixs = pauseIxs(owner, usdc);
    expect(ixs).toHaveLength(1);
    expect(ixs[0]!.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(ixs[0]!.keys.some((k) => k.pubkey.equals(SCRIP_PROGRAM_ID))).toBe(false);
  });

  it("resume: approve, then set_rule", () => {
    const ixs = resumeIxs({ owner, usdcMint: usdc, terms, allowanceUsdc: 500_000_000n });
    expect(ixs.ok && ixs.value[0]!.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(ixs.ok && decodeIx(ixs.value[1]!.data)?.name).toBe("set_rule");
  });

  it("disable: revoke, then disable_rule", () => {
    const ixs = disableRuleIxs(owner, usdc);
    expect(ixs.ok && ixs.value[0]!.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(ixs.ok && decodeIx(ixs.value[1]!.data)?.name).toBe("disable_rule");
  });

  it("refuses an empty allowance", () => {
    expect(enableRuleIxs({ owner, usdcMint: usdc, terms, allowanceUsdc: 0n, floatLamports: 0n }).ok).toBe(false);
  });
});

describe("sync_watermark and withdraw_float", () => {
  it("sync needs no signer", () => {
    const ix = syncWatermarkIx(owner, usdc);
    expect(ix.ok && ix.value.keys.every((k) => !k.isSigner)).toBe(true);
  });
  it("withdraw carries the lamports and refuses zero", () => {
    const ix = withdrawFloatIx(owner, 1_000n);
    expect(ix.ok && (decodeIx(ix.value.data)?.data as { lamports: BN }).lamports.toString()).toBe("1000");
    expect(withdrawFloatIx(owner, 0n).ok).toBe(false);
  });
});

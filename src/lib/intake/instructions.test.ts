/**
 * @vitest-environment node
 */
import { BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { defaultAsset } from "@/lib/assets/registry";
import { SCRIP_PROGRAM_ID, bookPda, decodeIx, newReleaseId, payoutPda, receiptPda } from "@/lib/solana/program";
import {
  cancelPayoutIx,
  claimPayoutIx,
  escrowAddress,
  fundPayoutIx,
  intakeFrame,
  measureReceiptIx,
  releasePayoutIx,
} from "./instructions";
import { MEMO_PROGRAM_ID, reasonHashHex } from "./memo";

const payer = Keypair.generate().publicKey;
const recipient = Keypair.generate().publicKey;
const rid = newReleaseId();
const asset = defaultAsset();

describe("fund_payout", () => {
  it("round-trips every argument, with the enum spelled the way the coder expects", () => {
    const ix = fundPayoutIx({
      payer,
      releaseId: rid,
      kind: "pay",
      recipient,
      claimant: null,
      reason: "a month of work",
      declaredUsdc: 200_000_000n,
      minOutRaw: 25_900_000n,
      asset,
    });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    const d = decodeIx(ix.value.data)?.data as {
      release_id: number[];
      kind: Record<string, unknown>;
      recipient: PublicKey;
      claimant: PublicKey;
      reason_hash: number[];
      declared_usdc: BN;
      min_out_raw: BN;
    };
    expect(Buffer.from(d.release_id).equals(Buffer.from(rid))).toBe(true);
    expect(Object.keys(d.kind)).toEqual(["Settle"]);
    expect(d.recipient.equals(recipient)).toBe(true);
    expect(d.claimant.equals(PublicKey.default)).toBe(true);
    expect(Buffer.from(d.reason_hash).toString("hex")).toBe(reasonHashHex("a month of work"));
    expect(d.declared_usdc.toString()).toBe("200000000");
    expect(d.min_out_raw.toString()).toBe("25900000");
    // payer, payout, asset_mint, escrow, recipient_book, token program, ata program, system
    expect(ix.value.keys[1]!.pubkey.equals(payoutPda(payer, rid))).toBe(true);
    expect(ix.value.keys[3]!.pubkey.equals(escrowAddress(payer, rid, asset))).toBe(true);
    expect(ix.value.keys[4]!.pubkey.equals(bookPda(recipient))).toBe(true);
    expect(ix.value.keys[5]!.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });

  it("a sponsor with no book passes the program id where the book would be", () => {
    const ix = fundPayoutIx({
      payer,
      releaseId: rid,
      kind: "gift",
      recipient,
      claimant: null,
      reason: "",
      declaredUsdc: 5_000_000n,
      minOutRaw: 1n,
      asset,
    });
    expect(ix.ok && ix.value.keys[4]!.pubkey.equals(SCRIP_PROGRAM_ID)).toBe(true);
    expect(ix.ok && Object.keys((decodeIx(ix.value.data)?.data as { kind: object }).kind)).toEqual(["Sponsor"]);
  });

  it("refuses what the program refuses, before a fee is paid", () => {
    const base = { payer, releaseId: rid, claimant: null, reason: "", minOutRaw: 1n, asset };
    expect(fundPayoutIx({ ...base, kind: "pay", recipient: null, declaredUsdc: 1n }).ok).toBe(false);
    expect(fundPayoutIx({ ...base, kind: "gift", recipient: null, declaredUsdc: 1n }).ok).toBe(false);
    expect(fundPayoutIx({ ...base, kind: "pay", recipient, declaredUsdc: 0n }).ok).toBe(false);
    expect(fundPayoutIx({ ...base, kind: "pay", recipient, declaredUsdc: 1n, reason: "x".repeat(201) }).ok).toBe(false);
  });
});

describe("release, claim, cancel, measure", () => {
  it("release names the receipt under the payout and the recipient's own token account", () => {
    const ix = releasePayoutIx({ payer, releaseId: rid, recipient, asset });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    const payout = payoutPda(payer, rid);
    expect(ix.value.keys[8]!.pubkey.equals(receiptPda(payout, rid))).toBe(true);
    // No price update supplied → the optional slot carries the program id.
    expect(ix.value.keys[7]!.pubkey.equals(SCRIP_PROGRAM_ID)).toBe(true);
  });

  it("claim carries the claim key only when there is one", () => {
    const relayer = Keypair.generate().publicKey;
    const key = Keypair.generate().publicKey;
    const with_ = claimPayoutIx({ claimer: recipient, feePayer: relayer, claimKey: key, payer, releaseId: rid, asset });
    const without = claimPayoutIx({ claimer: recipient, feePayer: relayer, claimKey: null, payer, releaseId: rid, asset });
    expect(with_.ok && with_.value.keys[2]!.pubkey.equals(key) && with_.value.keys[2]!.isSigner).toBe(true);
    expect(without.ok && without.value.keys[2]!.pubkey.equals(SCRIP_PROGRAM_ID)).toBe(true);
    expect(with_.ok && with_.value.keys[1]!.pubkey.equals(relayer) && with_.value.keys[1]!.isWritable).toBe(true);
  });

  it("cancel returns the escrow to the payer's own account", () => {
    const ix = cancelPayoutIx({ payer, releaseId: rid, asset });
    expect(ix.ok && decodeIx(ix.value.data)?.name).toBe("cancel_payout");
  });

  it("measure takes 7 or 30 and no signer", () => {
    const receipt = receiptPda(payoutPda(payer, rid), rid);
    const ix = measureReceiptIx({ receipt, recipient, asset, windowDays: 7 });
    expect(ix.ok && ix.value.keys.every((k) => !k.isSigner)).toBe(true);
    expect(ix.ok && (decodeIx(ix.value.data)?.data as { window_days: number }).window_days).toBe(7);
    expect(measureReceiptIx({ receipt, recipient, asset, windowDays: 14 as never }).ok).toBe(false);
  });
});

describe("intakeFrame", () => {
  it("is memo, fund … release, with the swap's destination in the middle", () => {
    const f = intakeFrame({ payer, releaseId: rid, recipient, reason: "a gift", declaredUsdc: 5_000_000n, minOutRaw: 1n, asset });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.value.before[0]!.programId.toBase58()).toBe(MEMO_PROGRAM_ID);
    expect(Buffer.from(f.value.before[0]!.data).toString("utf8")).toBe("a gift");
    expect(decodeIx(f.value.before[1]!.data)?.name).toBe("fund_payout");
    expect(decodeIx(f.value.after[0]!.data)?.name).toBe("release_payout");
    expect(f.value.escrow.equals(escrowAddress(payer, rid, asset))).toBe(true);
  });
  it("skips the memo when there is no reason", () => {
    const f = intakeFrame({ payer, releaseId: rid, recipient, reason: "", declaredUsdc: 5_000_000n, minOutRaw: 1n, asset });
    expect(f.ok && f.value.before).toHaveLength(1);
  });
});

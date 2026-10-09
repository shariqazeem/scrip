// @vitest-environment node
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { USDC_MINT, defaultAsset } from "@/lib/assets/registry";
import { MEMO_PROGRAM_ID } from "@/lib/intake/memo";
import { enableRuleIxs, openBookIx, usdcAta } from "@/lib/rule/instructions";
import { DEFAULT_ALLOWANCE_USDC, DEFAULT_CAP_USDC, DEFAULT_TOLERANCE_BPS, SUGGESTED_FLOAT_LAMPORTS } from "@/lib/rule/slice";
import { SCRIP_PROGRAM_ID, bookPda } from "@/lib/solana/program";
import { START_MEMO, firstPaymentHands, holdingSeed, startInstructions } from "./instructions";

const owner = Keypair.generate().publicKey;
const mint = new PublicKey(USDC_MINT);
const wallet = usdcAta(owner, mint);
const terms = { rateBps: 1_000, escalateBps: 0, floorUsdc: 0n, capUsdc: DEFAULT_CAP_USDC, toleranceBps: DEFAULT_TOLERANCE_BPS };

async function build(basisUsdc: bigint | null) {
  const open = openBookIx({ owner, slug: "tester", asset: defaultAsset(), usdcMint: mint, termsVersion: 1 });
  const rule = enableRuleIxs({ owner, usdcMint: mint, terms, allowanceUsdc: DEFAULT_ALLOWANCE_USDC, floatLamports: SUGGESTED_FLOAT_LAMPORTS });
  if (!open.ok || !rule.ok) throw new Error("could not build");
  const hands = basisUsdc === null ? null : await firstPaymentHands({ owner, usdcMint: mint, basisUsdc, seed: holdingSeed(() => 0.5), rentLamports: 2_039_280 });
  return { hands, ixs: startInstructions({ owner, open: [open.value], rule: rule.value, joins: [], hands }) };
}

/** A TransferChecked's amount, from its data: [12, amount u64 LE, decimals]. */
const amountOf = (data: Buffer) => data.readBigUInt64LE(1);

describe("the start, in order", () => {
  it("sets the first payment aside only around enable_rule, and hands all of it back", async () => {
    const { hands, ixs } = await build(10_100_000n);
    const holding = hands!.holding;
    const at = (pred: (i: (typeof ixs)[number]) => boolean) => ixs.findIndex(pred);
    const memo = at((i) => i.programId.equals(new PublicKey(MEMO_PROGRAM_ID)));
    const create = at((i) => i.programId.equals(SystemProgram.programId) && i.keys[1]?.pubkey.equals(holding) === true);
    const out = at((i) => i.programId.equals(TOKEN_PROGRAM_ID) && i.data[0] === 12 && i.keys[0]!.pubkey.equals(wallet) && i.keys[2]!.pubkey.equals(holding));
    const back = at((i) => i.programId.equals(TOKEN_PROGRAM_ID) && i.data[0] === 12 && i.keys[0]!.pubkey.equals(holding) && i.keys[2]!.pubkey.equals(wallet));
    const close = at((i) => i.programId.equals(TOKEN_PROGRAM_ID) && i.data[0] === 9 && i.keys[0]!.pubkey.equals(holding));
    const scrip = ixs.map((i, n) => (i.programId.equals(SCRIP_PROGRAM_ID) ? n : -1)).filter((n) => n >= 0);
    const enable = scrip[scrip.length - 1]!;

    expect(Buffer.from(ixs[memo]!.data).toString()).toBe(START_MEMO);
    expect([memo, create, out].every((n) => n >= 0 && n < scrip[0]!)).toBe(true);
    expect(back).toBe(enable + 1);
    expect(close).toBe(back + 1);
    expect(amountOf(Buffer.from(ixs[out]!.data))).toBe(10_100_000n);
    expect(amountOf(Buffer.from(ixs[back]!.data))).toBe(10_100_000n);
    // The holding account is the saver's: their address and a seed, owned by them, closed to them.
    expect(holding.equals(await PublicKey.createWithSeed(owner, holdingSeed(() => 0.5), TOKEN_PROGRAM_ID))).toBe(true);
    expect(ixs[close]!.keys[1]!.pubkey.equals(owner)).toBe(true);
    expect(ixs[close]!.keys[2]!.pubkey.equals(owner)).toBe(true);
    // The only signer anywhere is the saver.
    const signers = new Set(ixs.flatMap((i) => i.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58())));
    expect([...signers]).toEqual([owner.toBase58()]);
    // The approval names the Book, before enable_rule.
    const approve = at((i) => i.programId.equals(TOKEN_PROGRAM_ID) && i.data[0] === 13);
    expect(approve).toBeLessThan(enable);
    expect(ixs[approve]!.keys[2]!.pubkey.equals(bookPda(owner))).toBe(true);
  });

  it("is the plain start when there is no first payment", async () => {
    const { ixs } = await build(null);
    expect(ixs.some((i) => i.programId.equals(new PublicKey(MEMO_PROGRAM_ID)))).toBe(false);
    expect(ixs.some((i) => i.programId.equals(TOKEN_PROGRAM_ID) && i.data[0] === 12)).toBe(false);
  });

  it("makes a fresh, valid seed each time", () => {
    const a = holdingSeed();
    expect(a).toMatch(/^scrip-start-[0-9a-z]{8}$/);
    expect(a.length).toBeLessThanOrEqual(32);
    expect(holdingSeed(() => 0)).toBe("scrip-start-00000000");
  });
});

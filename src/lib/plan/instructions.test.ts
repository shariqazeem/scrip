/**
 * @vitest-environment node
 */
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { defaultAsset } from "@/lib/assets/registry";
import { decodeIx } from "@/lib/solana/program";
import { acceptMemberIx, addMemberIx, closePlanIx, matchReceiptIx, memberPda, openPlanIx, planPda, previewMatchUsdc, removeMemberIx, validateTerms } from "./instructions";

const sponsor = new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const owner = new PublicKey("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU");
const planId = new Uint8Array(16).fill(7);
const terms = { matchBps: 5_000, monthlyCapUsdc: 10_000_000n, defaultRateBps: 1_000, escalateBps: 100 };

describe("the Plan instructions encode against the program's own IDL", () => {
  it("opens a plan with its terms and an escrow owned by the plan", () => {
    const ix = openPlanIx({ sponsor, planId, asset: defaultAsset(), terms, reason: "Founding Plan" });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    const d = decodeIx(ix.value.data) as { name: string; data: { match_bps: number } };
    expect(d.name).toBe("open_plan");
    expect(d.data.match_bps).toBe(5_000);
    expect(ix.value.keys[1]!.pubkey.equals(planPda(sponsor, planId))).toBe(true);
    expect(ix.value.keys[0]).toMatchObject({ isSigner: true, isWritable: true });
  });

  it("invites, joins, removes and closes with the right signer each time", () => {
    const plan = planPda(sponsor, planId);
    const add = addMemberIx({ sponsor, plan, owner });
    const join = acceptMemberIx({ owner, plan });
    const remove = removeMemberIx({ sponsor, plan, owner });
    const close = closePlanIx({ sponsor, planId, asset: defaultAsset() });
    for (const ix of [add, join, remove, close]) expect(ix.ok).toBe(true);
    if (!add.ok || !join.ok || !remove.ok || !close.ok) return;
    expect(add.value.keys.find((k) => k.isSigner)!.pubkey.equals(sponsor)).toBe(true);
    expect(join.value.keys.find((k) => k.isSigner)!.pubkey.equals(owner)).toBe(true);
    expect(join.value.keys.some((k) => k.pubkey.equals(memberPda(plan, owner)) && k.isWritable)).toBe(true);
  });

  it("matches with the caller as the only signer: anyone may call it", () => {
    const ix = matchReceiptIx({ caller: sponsor, plan: planPda(sponsor, planId), owner, receipt: owner, priceUpdate: owner, asset: defaultAsset() });
    expect(ix.ok).toBe(true);
    if (!ix.ok) return;
    expect(ix.value.keys.filter((k) => k.isSigner)).toHaveLength(1);
  });

  it("refuses terms the program would refuse, before a wallet is asked", () => {
    expect(validateTerms(terms)).toBeNull();
    expect(validateTerms({ ...terms, matchBps: 0 })).toMatch(/between/);
    expect(validateTerms({ ...terms, matchBps: 10_001 })).toMatch(/between/);
    expect(validateTerms({ ...terms, monthlyCapUsdc: 0n })).toMatch(/cap/);
  });

  it("previews the match the way plan.rs computes it", () => {
    expect(previewMatchUsdc(10_000_000n, 5_000, 100_000_000n, 0n)).toBe(5_000_000n);
    expect(previewMatchUsdc(10_000_000n, 5_000, 10_000_000n, 8_000_000n)).toBe(2_000_000n);
    expect(previewMatchUsdc(10_000_000n, 5_000, 10_000_000n, 12_000_000n)).toBe(0n);
  });
});

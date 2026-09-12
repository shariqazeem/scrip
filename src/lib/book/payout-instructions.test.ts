/**
 * @vitest-environment node
 *
 * Node, not jsdom: `findProgramAddressSync` computes the wrong hash under jsdom's Uint8Array
 * realm. See instructions.test.ts.
 */
import { Keypair, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import type { Allocation } from "@/lib/allocator";
import { assetBySymbol } from "@/lib/assets/registry";
import type { Price } from "@/lib/pyth/price";
import { WEBGOLD_PROGRAM_ID, payoutPda, receiptPda } from "@/lib/solana/program";
import { decodeWebgoldIx } from "./instructions";
import {
  ataFor,
  cancelPayoutIx,
  fundPayoutIxs,
  releaseIdFrom,
  releasePayoutIxs,
  tokenProgramFor,
} from "./payout-instructions";

const GOLD = assetBySymbol("GOLD")!;
const SPY = assetBySymbol("SPYx")!;
const payer = Keypair.generate().publicKey;
const recipient = Keypair.generate().publicKey;
const releaseId = releaseIdFrom("founding-testers");
const NONCE = 42n;

const price = (dollars: number): Price => ({
  feedId: "",
  base: BigInt(Math.round(dollars * 1e6)),
  confBase: 200_000n,
  publishedAt: 0,
});

/** A two-leg mix that deliberately straddles both token programs. */
const mixed: Allocation = {
  legs: [
    { asset: GOLD, amount: 160_000n, valueBase: 695_840_000n, bps: 7000, price: price(4349) },
    { asset: SPY, amount: 38_970_000n, valueBase: 299_999_000n, bps: 3000, price: price(769.8224) },
  ],
  valueBase: 995_839_000n,
  requestedBase: 1_000_000_000n,
  gramsE8: 497_655_628n,
};

describe("fund_payout", () => {
  const built = fundPayoutIxs({
    payer,
    recipient,
    allocation: mixed,
    reason: "shipped the receipt page on Tuesday",
    releaseId,
    nonce: NONCE,
  });

  it("creates the escrow's own token accounts before escrowing into them", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // One create per leg, then the program instruction. The program will not create an
    // account it does not hold the rule for.
    expect(built.value.instructions).toHaveLength(3);
    expect(built.value.instructions[2]!.programId.equals(WEBGOLD_PROGRAM_ID)).toBe(true);
  });

  it("names a DIFFERENT token program for each leg", () => {
    // The bug this exists to prevent: Oro GOLD is a classic SPL mint and SPYx is Token-2022,
    // so an instruction that could name only one program could only ever pay half a mix.
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const ix = built.value.instructions[2]!;
    const legStart = 4;
    expect(ix.keys[legStart + 3]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true); // GOLD
    expect(ix.keys[legStart + 7]!.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true); // SPYx
    expect(tokenProgramFor(GOLD).equals(tokenProgramFor(SPY))).toBe(false);
  });

  it("escrows into accounts owned by the payout PDA, not by the payer", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const payout = payoutPda(payer, NONCE);
    expect(built.value.payout.equals(payout)).toBe(true);
    const ix = built.value.instructions[2]!;
    expect(ix.keys[5]!.pubkey.equals(ataFor(payer, GOLD))).toBe(true); // from
    expect(ix.keys[6]!.pubkey.equals(ataFor(payout, GOLD))).toBe(true); // to
  });

  it("round-trips EVERY value through the IDL, because a missing field encodes as zero", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const decoded = decodeWebgoldIx(Buffer.from(built.value.instructions[2]!.data));
    expect(decoded?.name).toBe("fund_payout");
    const d = decoded?.data as {
      nonce: { toString(): string };
      release_id: number[];
      value_base: { toString(): string };
      grams_e8: { toString(): string };
      legs: Array<{ mint: PublicKey; amount: { toString(): string } }>;
      reason: string;
    };
    // Anchor's coder encodes ZERO for a field name it cannot find, so "it encoded without
    // throwing" means nothing. A $0, 0-gram payout with the right legs attached would have
    // gone on chain and the receipt would have faithfully recorded it.
    expect(d.nonce.toString()).toBe("42");
    expect(d.value_base.toString()).toBe("995839000");
    expect(d.grams_e8.toString()).toBe("497655628");
    expect(Uint8Array.from(d.release_id)).toEqual(releaseId);
    expect(d.legs).toHaveLength(2);
    expect(d.legs[0]!.mint.toBase58()).toBe(GOLD.mint);
    expect(d.legs[0]!.amount.toString()).toBe("160000");
    expect(d.legs[1]!.mint.toBase58()).toBe(SPY.mint);
    expect(d.legs[1]!.amount.toString()).toBe("38970000");
    expect(d.reason).toBe("shipped the receipt page on Tuesday");
  });

  it("refuses a reason longer than the account reserves room for", () => {
    // The program's guard and the account's #[max_len] are the same number. Finding out at
    // account creation instead would fail with nothing readable to say about it.
    const long = fundPayoutIxs({
      payer,
      recipient,
      allocation: mixed,
      reason: "x".repeat(201),
      releaseId,
    });
    expect(long.ok).toBe(false);
    if (long.ok) return;
    expect(long.why).toMatch(/201 characters/);
  });

  it("refuses a release id that is not 32 bytes", () => {
    expect(
      fundPayoutIxs({
        payer,
        recipient,
        allocation: mixed,
        reason: "x",
        releaseId: new Uint8Array(31),
      }).ok,
    ).toBe(false);
  });

  it("refuses an empty allocation", () => {
    expect(
      fundPayoutIxs({
        payer,
        recipient,
        allocation: { ...mixed, legs: [] },
        reason: "x",
        releaseId,
      }).ok,
    ).toBe(false);
  });
});

describe("release_payout", () => {
  const built = releasePayoutIxs({ payer, recipient, allocation: mixed, nonce: NONCE, releaseId });

  it("creates the RECIPIENT's token accounts, paid for by the payer", () => {
    // The whole product in one detail: value arrives, and nobody had to decide to become an
    // investor — or to pay rent — first.
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.instructions).toHaveLength(3);
    const create = built.value.instructions[0]!;
    expect(create.keys[0]!.pubkey.equals(payer)).toBe(true); // payer funds the account
    expect(create.keys[2]!.pubkey.equals(recipient)).toBe(true); // recipient owns it
  });

  it("derives the receipt where anybody can find it", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.receipt.equals(receiptPda(releaseId, recipient))).toBe(true);
  });

  it("moves from the escrow's accounts to the recipient's", () => {
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const ix = built.value.instructions.at(-1)!;
    const payout = payoutPda(payer, NONCE);
    // payout, payer, receipt, cohort, system, goal-slot, then four per leg.
    const leg0 = 6;
    expect(ix.keys[leg0 + 1]!.pubkey.equals(ataFor(payout, GOLD))).toBe(true);
    expect(ix.keys[leg0 + 2]!.pubkey.equals(ataFor(recipient, GOLD))).toBe(true);
  });

  it("fills the optional goal slot with the program id when nobody is skimming", () => {
    // Anchor's convention for an omitted optional account. Getting this wrong does not error
    // — it shifts every leg by one account, and the program reads the wrong destinations.
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const ix = built.value.instructions.at(-1)!;
    expect(ix.keys[5]!.pubkey.equals(WEBGOLD_PROGRAM_ID)).toBe(true);
    expect(ix.keys[5]!.isWritable).toBe(false);
    // Four accounts per leg, two legs.
    expect(ix.keys).toHaveLength(6 + 8);
  });

  it("adds a FIFTH account per leg when a goal is taking a share", () => {
    /**
     * The program reads its stride from whether the optional goal account is present, so this
     * list and that decision have to agree exactly. If they drift, every leg is read one
     * account out of step — which does not fail cleanly, it moves the wrong tokens.
     */
    const goal = Keypair.generate().publicKey;
    const withGoal = releasePayoutIxs({
      payer,
      recipient,
      allocation: mixed,
      nonce: NONCE,
      releaseId,
      goal: { address: goal.toBase58(), skimBps: 1000 },
    });
    expect(withGoal.ok).toBe(true);
    if (!withGoal.ok) return;
    const ix = withGoal.value.instructions.at(-1)!;
    expect(ix.keys[5]!.pubkey.equals(goal)).toBe(true);
    expect(ix.keys[5]!.isWritable).toBe(true);
    expect(ix.keys).toHaveLength(6 + 10); // five per leg, two legs
    // The fifth slot of the first leg is the GOAL's token account for that mint.
    expect(ix.keys[6 + 4]!.pubkey.equals(ataFor(goal, GOLD))).toBe(true);
  });

  it("creates the goal's token accounts too, paid for by the payer", () => {
    const goal = Keypair.generate().publicKey;
    const withGoal = releasePayoutIxs({
      payer,
      recipient,
      allocation: mixed,
      nonce: NONCE,
      releaseId,
      goal: { address: goal.toBase58(), skimBps: 1000 },
    });
    expect(withGoal.ok).toBe(true);
    if (!withGoal.ok) return;
    // Two creates per leg (recipient and goal), plus the program instruction.
    expect(withGoal.value.instructions).toHaveLength(5);
  });

  it("gives every payout in one release the same receipt namespace", () => {
    // A campaign paying fifty people is fifty payouts sharing one release id, which is what
    // makes keep-rate a query over a cohort rather than a join nobody can reproduce.
    const other = Keypair.generate().publicKey;
    const a = receiptPda(releaseId, recipient);
    const b = receiptPda(releaseId, other);
    expect(a.equals(b)).toBe(false);
    expect(receiptPda(releaseIdFrom("other-campaign"), recipient).equals(a)).toBe(false);
  });
});

describe("cancel_payout", () => {
  it("returns every leg to the payer's own accounts", () => {
    const ix = cancelPayoutIx({ payer, allocation: mixed, nonce: NONCE });
    const payout = payoutPda(payer, NONCE);
    expect(ix.keys[3]!.pubkey.equals(ataFor(payout, GOLD))).toBe(true); // from escrow
    expect(ix.keys[4]!.pubkey.equals(ataFor(payer, GOLD))).toBe(true); // back to payer
    expect(decodeWebgoldIx(Buffer.from(ix.data))?.name).toBe("cancel_payout");
  });
});

describe("release ids", () => {
  it("are deterministic, 32 bytes, and distinct per label", () => {
    expect(releaseIdFrom("a")).toHaveLength(32);
    expect(releaseIdFrom("a")).toEqual(releaseIdFrom("a"));
    expect(releaseIdFrom("a")).not.toEqual(releaseIdFrom("b"));
  });
});

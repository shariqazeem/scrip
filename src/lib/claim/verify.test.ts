/**
 * @vitest-environment node
 */
import { ComputeBudgetProgram, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { LIGHTHOUSE_PROGRAM_ID, isLighthouseAssertion, priorityFeeLamports, verifySponsoredClaim } from "./verify";

/**
 * The relayer's money is on the other side of this function. Every case round-trips through
 * a real serialize and Transaction.from, because that is what the server actually receives —
 * and a deserialized transaction reports account flags from the message, not the instruction.
 */
const PROGRAM = new PublicKey("Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj");
const relayer = Keypair.generate().publicKey;
const claimer = Keypair.generate().publicKey;
const escrow = Keypair.generate().publicKey;
const book = Keypair.generate().publicKey;
const thief = Keypair.generate().publicKey;

// The claimer is read-only in open_book and writable in claim_payout, so after a round trip
// the message reports it writable in BOTH — the case a flag-comparing check would refuse.
const openBook = new TransactionInstruction({
  programId: PROGRAM,
  keys: [
    { pubkey: claimer, isSigner: true, isWritable: false },
    { pubkey: relayer, isSigner: true, isWritable: true },
    { pubkey: book, isSigner: false, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([1, 2, 3, 4]),
});
const claim = new TransactionInstruction({
  programId: PROGRAM,
  keys: [
    { pubkey: claimer, isSigner: true, isWritable: true },
    { pubkey: relayer, isSigner: true, isWritable: true },
    { pubkey: escrow, isSigner: false, isWritable: true },
    { pubkey: book, isSigner: false, isWritable: false },
  ],
  data: Buffer.from([9, 9, 9]),
});
const expected = [openBook, claim];

function received(ixs: TransactionInstruction[], feePayer: PublicKey = relayer) {
  const tx = new Transaction({ feePayer, blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 }).add(...ixs);
  const back = Transaction.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  return { feePayer: back.feePayer, instructions: back.instructions };
}
function verify(ixs: TransactionInstruction[], feePayer?: PublicKey) {
  const r = received(ixs, feePayer);
  return verifySponsoredClaim({ feePayer: r.feePayer, relayer, instructions: r.instructions, expected });
}
function lighthouse(discriminator: number, keys: PublicKey[] = [claimer]) {
  return new TransactionInstruction({
    programId: LIGHTHOUSE_PROGRAM_ID,
    keys: keys.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })),
    data: Buffer.from([discriminator, 0, 0, 0]),
  });
}

describe("verifySponsoredClaim — what the relayer will co-sign", () => {
  it("accepts the claim exactly as built, despite message-level flags", () => {
    const r = received(expected);
    // Prove this case really exercises the quirk: the claimer was read-only in open_book.
    expect(r.instructions[0]!.keys[0]!.isWritable).toBe(true);
    const v = verifySponsoredClaim({ feePayer: r.feePayer, relayer, instructions: r.instructions, expected });
    expect(v.ok && v.value.guards).toBe(0);
  });

  it("accepts Phantom's assertions, including ones that guard the relayer itself", () => {
    const v = verify([lighthouse(6, [claimer]), openBook, claim, lighthouse(10, [relayer, escrow])]);
    expect(v.ok && v.value.guards).toBe(2);
  });

  it("accepts an assertion placed between the claim's own instructions", () => {
    expect(verify([openBook, lighthouse(9), claim]).ok).toBe(true);
  });

  it("refuses a transfer out of the relayer", () => {
    const drain = SystemProgram.transfer({ fromPubkey: relayer, toPubkey: thief, lamports: 1_000_000_000 });
    expect(verify([openBook, claim, drain]).ok).toBe(false);
  });

  it("refuses a Lighthouse memory write or close, either of which can bill the relayer rent", () => {
    expect(verify([lighthouse(0), openBook, claim]).ok).toBe(false);
    expect(verify([lighthouse(1), openBook, claim]).ok).toBe(false);
  });

  it("refuses the Lighthouse assertions that call into another program", () => {
    expect(verify([lighthouse(16), openBook, claim]).ok).toBe(false);
    expect(verify([lighthouse(17), openBook, claim]).ok).toBe(false);
  });

  it("refuses a compute-unit price, which the relayer would pay", () => {
    const price = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000_000 });
    expect(verify([price, openBook, claim]).ok).toBe(false);
  });

  it("refuses a second copy of the claim", () => {
    expect(verify([openBook, claim, claim]).ok).toBe(false);
  });

  it("refuses a claim whose data was changed", () => {
    const altered = new TransactionInstruction({ programId: PROGRAM, keys: claim.keys, data: Buffer.from([9, 9, 8]) });
    expect(verify([openBook, altered]).ok).toBe(false);
  });

  it("refuses a claim pointed at a different account", () => {
    const redirected = new TransactionInstruction({
      programId: PROGRAM,
      keys: claim.keys.map((k) => (k.pubkey.equals(escrow) ? { ...k, pubkey: thief } : k)),
      data: claim.data,
    });
    expect(verify([openBook, redirected]).ok).toBe(false);
  });

  it("refuses a claim with an instruction missing", () => {
    expect(verify([claim]).ok).toBe(false);
  });

  it("refuses a transaction whose fee payer is not the relayer", () => {
    expect(verify(expected, claimer).ok).toBe(false);
  });
});

describe("isLighthouseAssertion", () => {
  it("allows only discriminators 2 to 15, and only on the Lighthouse program", () => {
    expect(isLighthouseAssertion(lighthouse(2))).toBe(true);
    expect(isLighthouseAssertion(lighthouse(15))).toBe(true);
    for (const d of [0, 1, 16, 17, 200]) expect(isLighthouseAssertion(lighthouse(d))).toBe(false);
    const empty = new TransactionInstruction({ programId: LIGHTHOUSE_PROGRAM_ID, keys: [], data: Buffer.alloc(0) });
    expect(isLighthouseAssertion(empty)).toBe(false);
    expect(isLighthouseAssertion(new TransactionInstruction({ programId: PROGRAM, keys: [], data: Buffer.from([2]) }))).toBe(false);
  });
});

describe("the signing order Phantom asks for, end to end", () => {
  const blockhash = "11111111111111111111111111111111";

  function setup() {
    const relayerKp = Keypair.generate();
    const walletKp = Keypair.generate();
    const claimKp = Keypair.generate();
    const ix = new TransactionInstruction({
      programId: PROGRAM,
      keys: [
        { pubkey: walletKp.publicKey, isSigner: true, isWritable: true },
        { pubkey: relayerKp.publicKey, isSigner: true, isWritable: true },
        { pubkey: claimKp.publicKey, isSigner: true, isWritable: false },
      ],
      data: Buffer.from([7, 7]),
    });
    const unsigned = new Transaction({ feePayer: relayerKp.publicKey, blockhash, lastValidBlockHeight: 1 })
      .add(ix)
      .serialize({ requireAllSignatures: false, verifySignatures: false });
    return { relayerKp, walletKp, claimKp, ix, unsigned };
  }
  const loose = { requireAllSignatures: false, verifySignatures: false } as const;

  it("wallet, then claim key, then relayer — and every signature still verifies", () => {
    const { relayerKp, walletKp, claimKp, unsigned } = setup();
    const w = Transaction.from(unsigned);
    w.partialSign(walletKp); // the wallet signs a transaction carrying no other signature
    const c = Transaction.from(w.serialize(loose));
    c.partialSign(claimKp); // the claim key, in the browser, after the wallet
    const s = Transaction.from(c.serialize(loose));
    s.partialSign(relayerKp); // the relayer, on the server, last
    expect(() => s.serialize()).not.toThrow(); // requireAllSignatures + verifySignatures
  });

  it("still verifies when Phantom inserts a Lighthouse guard before signing", () => {
    const { relayerKp, walletKp, claimKp, ix, unsigned } = setup();
    const w = Transaction.from(unsigned);
    w.add(lighthouse(6, [walletKp.publicKey, relayerKp.publicKey])); // the guard changes the message
    w.partialSign(walletKp);
    const c = Transaction.from(w.serialize(loose));
    c.partialSign(claimKp);
    const s = Transaction.from(c.serialize(loose));
    const v = verifySponsoredClaim({ feePayer: s.feePayer, relayer: relayerKp.publicKey, instructions: s.instructions, expected: [ix] });
    expect(v.ok && v.value.guards).toBe(1);
    s.partialSign(relayerKp);
    expect(() => s.serialize()).not.toThrow();
  });

  it("the old order — relayer first — is what Phantom saw: a signature already present", () => {
    const { relayerKp, unsigned } = setup();
    const old = Transaction.from(unsigned);
    old.partialSign(relayerKp);
    const arrived = Transaction.from(old.serialize(loose));
    expect(arrived.signatures.some((s) => s.signature !== null)).toBe(true);
    const now = Transaction.from(unsigned);
    expect(now.signatures.every((s) => s.signature === null)).toBe(true);
  });
});

describe("the priority fee the relayer pays, bounded", () => {
  const ourLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 });
  const ourPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20_000 });
  const built = [ourLimit, ourPrice, openBook, claim];
  function verifyBuilt(ixs: TransactionInstruction[]) {
    const r = received(ixs);
    return verifySponsoredClaim({ feePayer: r.feePayer, relayer, instructions: r.instructions, expected: built });
  }

  it("accepts the budget the claim sets itself, and it costs the relayer 6,000 lamports", () => {
    const v = verifyBuilt(built);
    expect(v.ok && v.value.priorityLamports).toBe(6_000n);
  });

  it("accepts what Phantom actually returned on 2026-09-23: its own budget added to a claim that had none", () => {
    // The first real claim after the relayer stopped signing first: four instructions where
    // two were built. Phantom's docs: it adds a priority fee to any transaction that arrives
    // unsigned and without one. Bounded, that is fine.
    const phantomLimit = ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 });
    const phantomPrice = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 });
    const r = received([phantomLimit, phantomPrice, openBook, claim]);
    const v = verifySponsoredClaim({ feePayer: r.feePayer, relayer, instructions: r.instructions, expected });
    expect(v.ok && v.value.priorityLamports).toBe(20_000n);
  });

  it("accepts a wallet raising the price, while the fee stays under the ceiling", () => {
    const raised = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 300_000 });
    expect(verifyBuilt([ourLimit, raised, openBook, claim]).ok).toBe(true); // 90,000 lamports
  });

  it("refuses a price that would bill the relayer above the ceiling", () => {
    const greedy = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400_000 }); // 120,000
    const v = verifyBuilt([ourLimit, greedy, openBook, claim]);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.why).toMatch(/ceiling/);
  });

  it("refuses the limit or the price set twice", () => {
    expect(verifyBuilt([ourLimit, ourLimit, ourPrice, openBook, claim]).ok).toBe(false);
    expect(verifyBuilt([ourLimit, ourPrice, ourPrice, openBook, claim]).ok).toBe(false);
  });

  it("refuses any compute-budget instruction other than a limit or a price", () => {
    const heap = ComputeBudgetProgram.requestHeapFrame({ bytes: 256 * 1024 });
    expect(verifyBuilt([heap, ourLimit, ourPrice, openBook, claim]).ok).toBe(false);
  });

  it("names what was unexpected, so the next surprise is diagnosed from the message", () => {
    const drain = SystemProgram.transfer({ fromPubkey: relayer, toPubkey: thief, lamports: 1 });
    const v = verifyBuilt([ourLimit, ourPrice, openBook, claim, drain]);
    expect(!v.ok && v.why).toMatch(/unexpected: System/);
  });

  it("the fee is price times limit, rounded up, as the runtime charges it", () => {
    const p = priorityFeeLamports([ComputeBudgetProgram.setComputeUnitLimit({ units: 3 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1 })], 1);
    expect(p.ok && p.value).toBe(1n); // 3 microlamports rounds up to one lamport
    const none = priorityFeeLamports([], 2);
    expect(none.ok && none.value).toBe(0n);
  });
});

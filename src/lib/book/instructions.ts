import { BN, BorshInstructionCoder } from "@coral-xyz/anchor";
import type { Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { type Policy, validatePolicy } from "@/lib/policy";
import { type Outcome, held, ok } from "@/lib/outcome";
import { WEBGOLD_IDL, WEBGOLD_PROGRAM_ID, bookPda } from "@/lib/solana/program";

/**
 * BUILDING THE TWO INSTRUCTIONS THAT WRITE A BOOK.
 *
 * Encoded from the committed IDL rather than from hand-written discriminators, so the
 * instruction layout has exactly one definition — the Rust struct — and a program change that
 * is not synced into `src/lib/anchor/` fails loudly at `npm run anchor:build` rather than
 * quietly producing a transaction the program will reject.
 *
 * NO PROVIDER, NO WALLET, NO CONNECTION. An instruction is data; building one should not
 * require a signer, a network handle or an `AnchorProvider`. This runs on either side, and
 * what signs it is the browser wallet, at the last moment, holding the only key involved.
 *
 * The policy is validated here too, not only in the form. A caller that skips the form — a
 * script, a future API, a rebuilt page — must not be able to send a policy the program will
 * refuse, because the person finds out by paying for a failed transaction.
 */

const coder = new BorshInstructionCoder(WEBGOLD_IDL as Idl);

/**
 * The on-chain shape: legs of (mint, bps), a drift band, and a timestamp the program sets.
 *
 * FIELD NAMES ARE snake_case, AND THIS IS NOT A STYLE CHOICE. Anchor's Borsh coder matches
 * the IDL's own names, and for a field it cannot find it encodes ZERO rather than throwing.
 * Written as `driftBps` — which is what the TypeScript type calls it, and what any reasonable
 * person would write — this silently sent `drift_bps: 0` on every policy: a rebalance band of
 * nothing, accepted by the program, wrong forever, with no error anywhere. Caught by the
 * round-trip assertions in `instructions.test.ts`, which is why every encoder in this codebase
 * has one.
 */
function encodePolicy(policy: Policy) {
  return {
    legs: policy.legs.map((l) => ({ mint: new PublicKey(l.mint), bps: l.bps })),
    drift_bps: policy.driftBps,
    // An i64, so it needs a BN rather than a number — the layout calls `toTwos` on it.
    // Overwritten by the program from the clock: a timestamp the caller chooses proves
    // nothing, and the program treats it that way.
    updated_at: new BN(0),
  };
}

export function openBookIx(owner: PublicKey, policy: Policy): Outcome<TransactionInstruction> {
  const valid = validatePolicy(policy);
  if (!valid.ok) return valid;
  const data = coder.encode("open_book", { policy: encodePolicy(policy) });
  return ok(
    new TransactionInstruction({
      programId: WEBGOLD_PROGRAM_ID,
      keys: [
        { pubkey: bookPda(owner), isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
  );
}

export function setPolicyIx(owner: PublicKey, policy: Policy): Outcome<TransactionInstruction> {
  const valid = validatePolicy(policy);
  if (!valid.ok) return valid;
  const data = coder.encode("set_policy", { policy: encodePolicy(policy) });
  return ok(
    new TransactionInstruction({
      programId: WEBGOLD_PROGRAM_ID,
      keys: [
        { pubkey: bookPda(owner), isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: true, isWritable: false },
      ],
      data,
    }),
  );
}

export function closeBookIx(owner: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: WEBGOLD_PROGRAM_ID,
    keys: [
      { pubkey: bookPda(owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: true },
    ],
    data: coder.encode("close_book", {}),
  });
}

/** Decode one of our own instructions back — used by tests, and by a receipt page later. */
export function decodeWebgoldIx(data: Buffer) {
  return coder.decode(data);
}

/** A hold worth saying out loud rather than a failed transaction. */
export function programNotDeployed(cluster: string): Outcome<never> {
  return held(
    `The Webgold program is not deployed on ${cluster} yet, so a policy cannot be signed here. ` +
      `Nothing was sent and nothing was charged.`,
  );
}

import { PublicKey } from "@solana/web3.js";
import idl from "@/lib/anchor/webgold.json";

/**
 * THE PROGRAM'S ADDRESS, DERIVED FROM THE IDL AND NOWHERE ELSE.
 *
 * The same id is written in three places by three different tools — `declare_id!` in the
 * program source, `[programs.*]` in Anchor.toml, and the IDL's `address` field. Three lists
 * that drift is three chances to sign a transaction against a program that is not the one
 * deployed. Nothing in TypeScript re-types it: this reads the IDL, and
 * `program.test.ts` reads all three files and fails if any pair disagrees.
 */
export const WEBGOLD_IDL = idl;

export const WEBGOLD_PROGRAM_ID = new PublicKey(idl.address);

/** PDA seeds, defined once. A seed literal retyped at a call site is a silently wrong address. */
export const SEED = {
  book: "book",
  payout: "payout",
  receipt: "receipt",
  goal: "goal",
  cohort: "cohort",
} as const;

/** `[b"book", owner]` — one book per owner, derivable by anyone who knows the owner. */
export function bookPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEED.book), owner.toBuffer()],
    WEBGOLD_PROGRAM_ID,
  )[0];
}

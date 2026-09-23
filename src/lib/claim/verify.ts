import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { held, ok, type Outcome } from "@/lib/outcome";

/**
 * THE RELAYER SIGNS LAST, SO IT HAS TO CHECK WHAT IT SIGNS.
 *
 * A claim is fee-sponsored: Scrip's relayer is the fee payer, so an empty wallet can take its
 * first position. The relayer used to sign when the claim was BUILT, before the browser ever
 * had it — which made it safe by construction, because its signature was locked to the exact
 * message, and any change invalidated it.
 *
 * It was also why Phantom blocked every claim. Phantom's Lighthouse guard adds assertion
 * instructions to a transaction before the wallet signs; it cannot do that to a transaction
 * that already carries someone else's signature, so it flags it instead. Phantom's support
 * named the fix exactly: the wallet signs first, other signers afterwards.
 *
 * So the relayer now signs AFTER the browser has had the transaction, and a signature that
 * used to be safe by construction must now be safe by inspection. Without this function, the
 * relayer would co-sign anything shaped like a claim — including a System Program transfer
 * from itself to whoever built it.
 *
 * The rule: every instruction is either (a) exactly one of the instructions the server itself
 * would build for this claim, in order, byte for byte, or (b) a Lighthouse ASSERTION. Nothing
 * else — not a second claim, not a compute-budget price, not a Lighthouse memory write.
 */

export const LIGHTHOUSE_PROGRAM_ID = new PublicKey("L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95");

/**
 * Lighthouse's instruction discriminators, read from its generated Rust client on 2026-09-23
 * (github.com/Jac0xb/lighthouse, clients/rust/src/generated/instructions/*.rs):
 *
 *   0  MemoryWrite       REFUSED — names a payer that funds a memory account's rent, and on a
 *   1  MemoryClose       REFUSED   sponsored transaction that payer can be the relayer
 *   2  AssertAccountData            ┐
 *   3  AssertAccountDataMulti       │
 *   4  AssertAccountDelta           │
 *   5  AssertAccountInfo            │  read-only: an assertion reads account state and aborts
 *   6  AssertAccountInfoMulti       │  the transaction on a mismatch. It cannot move lamports,
 *   7  AssertMintAccount            │  which is why it may reference the relayer — Phantom
 *   8  AssertMintAccountMulti       │  guards the fee payer too (CoW Protocol found the same,
 *   9  AssertTokenAccount           │  cowprotocol/services#4960)
 *  10  AssertTokenAccountMulti      │
 *  11  AssertStakeAccount           │
 *  12  AssertStakeAccountMulti      │
 *  13  AssertUpgradeableLoaderAccount
 *  14  AssertUpgradeableLoaderAccountMulti
 *  15  AssertSysvarClock            ┘
 *  16  AssertMerkleTreeAccount           REFUSED — each calls into another program, and a claim
 *  17  AssertBubblegumTreeConfigAccount  REFUSED   has no reason to carry one
 *
 * An allowlist, not a denylist: a variant added to Lighthouse later is refused until someone
 * reads it. The program is upgradeable, so "everything except memory" would be a promise
 * about code that has not been written yet.
 */
const ASSERTION_FIRST = 2;
const ASSERTION_LAST = 15;

export function isLighthouseAssertion(ix: TransactionInstruction): boolean {
  if (!ix.programId.equals(LIGHTHOUSE_PROGRAM_ID)) return false;
  const d = ix.data[0];
  return d !== undefined && d >= ASSERTION_FIRST && d <= ASSERTION_LAST;
}

function sameInstruction(a: TransactionInstruction, b: TransactionInstruction): boolean {
  if (!a.programId.equals(b.programId)) return false;
  if (!a.data.equals(b.data)) return false;
  if (a.keys.length !== b.keys.length) return false;
  // Accounts compared by address and position, deliberately NOT by the signer and writable
  // flags. A deserialized legacy transaction reports each account's flags from the MESSAGE,
  // which is the union across every instruction, so an account read in one instruction and
  // written in another shows as writable in both. Comparing flags would refuse honest claims.
  // Nothing is lost: a flag cannot make an extra account sign (the signature is still needed
  // and is verified), and a Scrip instruction does only what its own code does however many
  // of its accounts are writable — a missing write fails the program, not the relayer.
  for (let i = 0; i < a.keys.length; i++) {
    if (!a.keys[i]!.pubkey.equals(b.keys[i]!.pubkey)) return false;
  }
  return true;
}

export function verifySponsoredClaim(input: {
  feePayer: PublicKey | null | undefined;
  relayer: PublicKey;
  instructions: readonly TransactionInstruction[];
  expected: readonly TransactionInstruction[];
}): Outcome<{ guards: number }> {
  if (!input.feePayer || !input.feePayer.equals(input.relayer)) {
    return held("The claim's fee payer is not Scrip's relayer.");
  }

  const rest: TransactionInstruction[] = [];
  let guards = 0;
  for (const ix of input.instructions) {
    if (ix.programId.equals(LIGHTHOUSE_PROGRAM_ID)) {
      if (!isLighthouseAssertion(ix)) {
        return held(`A Lighthouse instruction other than an assertion (discriminator ${ix.data[0] ?? "none"}) was added.`);
      }
      guards++;
      continue;
    }
    rest.push(ix);
  }

  if (rest.length !== input.expected.length) {
    return held(`The claim carries ${rest.length} instruction(s) where ${input.expected.length} were built.`);
  }
  for (let i = 0; i < rest.length; i++) {
    if (!sameInstruction(rest[i]!, input.expected[i]!)) {
      return held(`Instruction ${i + 1} is not the one Scrip built for this claim.`);
    }
  }
  return ok({ guards });
}

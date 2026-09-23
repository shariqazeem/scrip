import { ComputeBudgetProgram, PublicKey, type TransactionInstruction } from "@solana/web3.js";
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

/**
 * THE PRIORITY FEE, BOUNDED. Phantom adds its own compute-budget instructions to every
 * transaction that arrives unsigned and without them — in signTransaction too, not only
 * signAndSend (docs.phantom.com/developer-powertools/solana-priority-fees). Once the relayer
 * stopped signing first, the claim arrived unsigned, Phantom added SetComputeUnitLimit and
 * SetComputeUnitPrice, and the first real claim was refused for carrying four instructions
 * where two were built.
 *
 * The claim now carries its own budget (src/lib/claim/build.ts), which is what Phantom's docs
 * say makes it leave the transaction alone. But the relayer pays whatever price ends up in
 * it, so the budget is not matched byte for byte: it is BOUNDED. Only a limit and a price,
 * each at most once, and the fee they imply — the price times the limit — must stay under a
 * ceiling. A wallet that nudges the price for congestion is fine; a price that would bill the
 * relayer real money is refused. Without this, a compute-unit price was the cheapest way to
 * drain the relayer through an otherwise honest claim.
 */
export const COMPUTE_BUDGET_PROGRAM_ID = ComputeBudgetProgram.programId;
/** 0.0001 SOL. The claim itself asks for 6,000 lamports; this leaves a wallet ~16x room. */
export const MAX_RELAYER_PRIORITY_LAMPORTS = 100_000n;
const DEFAULT_UNITS_PER_INSTRUCTION = 200_000n;
const MAX_UNITS = 1_400_000n;

export function priorityFeeLamports(budget: readonly TransactionInstruction[], otherInstructions: number): Outcome<bigint> {
  let units: bigint | null = null;
  let price: bigint | null = null;
  for (const ix of budget) {
    const d = ix.data[0];
    if (d === 2 && ix.data.length >= 5) {
      if (units !== null) return held("The compute-unit limit is set twice.");
      units = BigInt(ix.data.readUInt32LE(1));
    } else if (d === 3 && ix.data.length >= 9) {
      if (price !== null) return held("The compute-unit price is set twice.");
      price = ix.data.readBigUInt64LE(1);
    } else {
      return held(`A compute-budget instruction other than a limit or a price (discriminator ${d ?? "none"}) was added.`);
    }
  }
  let limit = units ?? DEFAULT_UNITS_PER_INSTRUCTION * BigInt(Math.max(1, otherInstructions));
  if (limit > MAX_UNITS) limit = MAX_UNITS;
  const micro = (price ?? 0n) * limit;
  return ok((micro + 999_999n) / 1_000_000n); // the runtime rounds up
}

function programName(id: PublicKey): string {
  if (id.equals(COMPUTE_BUDGET_PROGRAM_ID)) return "ComputeBudget";
  if (id.equals(LIGHTHOUSE_PROGRAM_ID)) return "Lighthouse";
  if (id.equals(new PublicKey("11111111111111111111111111111111"))) return "System";
  return `${id.toBase58().slice(0, 8)}…`;
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
}): Outcome<{ guards: number; priorityLamports: bigint }> {
  if (!input.feePayer || !input.feePayer.equals(input.relayer)) {
    return held("The claim's fee payer is not Scrip's relayer.");
  }

  const rest: TransactionInstruction[] = [];
  const budget: TransactionInstruction[] = [];
  let guards = 0;
  for (const ix of input.instructions) {
    if (ix.programId.equals(LIGHTHOUSE_PROGRAM_ID)) {
      if (!isLighthouseAssertion(ix)) {
        return held(`A Lighthouse instruction other than an assertion (discriminator ${ix.data[0] ?? "none"}) was added.`);
      }
      guards++;
      continue;
    }
    if (ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
      budget.push(ix);
      continue;
    }
    rest.push(ix);
  }

  // The claim's own instructions, matched exactly. The budget is checked separately, below.
  const core = input.expected.filter((ix) => !ix.programId.equals(COMPUTE_BUDGET_PROGRAM_ID));
  if (rest.length !== core.length) {
    const extra = rest.filter((ix) => !core.some((c) => sameInstruction(c, ix))).map((ix) => programName(ix.programId));
    return held(
      `The claim carries ${rest.length} instruction(s) where ${core.length} were built${extra.length ? `; unexpected: ${extra.join(", ")}` : ""}.`,
    );
  }
  for (let i = 0; i < rest.length; i++) {
    if (!sameInstruction(rest[i]!, core[i]!)) {
      return held(`Instruction ${i + 1} is not the one Scrip built for this claim.`);
    }
  }

  const fee = priorityFeeLamports(budget, rest.length + guards);
  if (!fee.ok) return fee;
  if (fee.value > MAX_RELAYER_PRIORITY_LAMPORTS) {
    return held(`The priority fee would cost the relayer ${fee.value} lamports; the ceiling is ${MAX_RELAYER_PRIORITY_LAMPORTS}.`);
  }
  return ok({ guards, priorityLamports: fee.value });
}

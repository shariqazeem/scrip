import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  createInitializeAccount3Instruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { USDC_DECIMALS } from "@/lib/assets/registry";
import { memoIx } from "@/lib/intake/instructions";
import { USDC_ACCOUNT_BYTES, usdcAta } from "@/lib/rule/instructions";
import { START_MEMO } from "./memo";

export { START_MEMO };

/**
 * THE START, IN ORDER — and the two hands that make the first payment count.
 *
 *     [memo, open a holding account, move the payment into it,
 *      open_book, approve, prepay, enable_rule,
 *      move the payment back, close the holding account, accept_member…]
 *
 * `enable_rule` records the wallet's USDC balance as the point after which money counts as
 * arriving (its watermark). With the payment set aside in the saver's own holding account for
 * that one instruction, the watermark sits that much lower; the payment comes straight back in
 * the same transaction, so to the program it has just arrived, and Scrip's servers save its
 * slice seconds later exactly as they save every payment after it.
 *
 * Nothing leaves the saver: the holding account is a USDC account the saver owns, made from
 * their own address and a seed (so the saver is the only signer), and closed before the
 * transaction ends, its rent back in the same wallet. If any instruction fails, none happened.
 *
 * THE MEMO says what the transaction was, to anyone reading the chain, and is how the indexer
 * knows that the first save's arrival is this transaction (`lib/ledger/attribute.ts`).
 */
/** A holding account's seed: fresh each time, so an address somebody funded in advance cannot block a start. */
export function holdingSeed(random: () => number = Math.random): string {
  return `scrip-start-${Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0")}`;
}

export type FirstHands = {
  /** The saver's own holding account, for the one instruction the payment is set aside. */
  readonly holding: PublicKey;
  /** Before `enable_rule`: open the holding account and move the payment into it. */
  readonly before: readonly TransactionInstruction[];
  /** After it: move the payment back and close the holding account, rent to the saver. */
  readonly after: readonly TransactionInstruction[];
};

export async function firstPaymentHands(input: {
  readonly owner: PublicKey;
  readonly usdcMint: PublicKey;
  readonly basisUsdc: bigint;
  readonly seed: string;
  /** Rent for a 165-byte token account, returned when it closes. */
  readonly rentLamports: number;
}): Promise<FirstHands> {
  const { owner, usdcMint, basisUsdc, seed } = input;
  const holding = await PublicKey.createWithSeed(owner, seed, TOKEN_PROGRAM_ID);
  const wallet = usdcAta(owner, usdcMint);
  return {
    holding,
    before: [
      SystemProgram.createAccountWithSeed({
        fromPubkey: owner,
        newAccountPubkey: holding,
        basePubkey: owner,
        seed,
        lamports: input.rentLamports,
        space: USDC_ACCOUNT_BYTES,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeAccount3Instruction(holding, usdcMint, owner, TOKEN_PROGRAM_ID),
      createTransferCheckedInstruction(wallet, usdcMint, holding, owner, basisUsdc, USDC_DECIMALS, [], TOKEN_PROGRAM_ID),
    ],
    after: [
      createTransferCheckedInstruction(holding, usdcMint, wallet, owner, basisUsdc, USDC_DECIMALS, [], TOKEN_PROGRAM_ID),
      createCloseAccountInstruction(holding, owner, owner, [], TOKEN_PROGRAM_ID),
    ],
  };
}

/** The start's instructions, in the only order that works. `rule` ends with `enable_rule`. */
export function startInstructions(input: {
  readonly owner: PublicKey;
  /** Opening the USDC account when it is missing, then `open_book`. */
  readonly open: readonly TransactionInstruction[];
  /** approve, prepay, enable_rule. */
  readonly rule: readonly TransactionInstruction[];
  readonly joins: readonly TransactionInstruction[];
  readonly hands: FirstHands | null;
}): TransactionInstruction[] {
  if (!input.hands) return [...input.open, ...input.rule, ...input.joins];
  return [memoIx(input.owner, START_MEMO), ...input.hands.before, ...input.open, ...input.rule, ...input.hands.after, ...input.joins];
}

import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import type { Asset } from "@/lib/assets/registry";
import type { Outcome } from "@/lib/outcome";
import { assetAta, tokenProgramFor, usdcAta } from "@/lib/rule/instructions";
import { bookPda, buildIx, receiptPda } from "@/lib/solana/program";

/**
 * THE TWO HALVES OF A SWEEP. The keeper signs both; the program proves through the
 * instructions sysvar that the second follows the first before it moves anything.
 *
 *     [compute, begin_sweep, jupiter setup?, jupiter swap, jupiter cleanup?, finish_sweep]
 */

export function beginSweepIx(input: {
  keeper: PublicKey;
  owner: PublicKey;
  usdcMint: PublicKey;
  asset: Pick<Asset, "mint" | "program">;
  releaseId: Uint8Array;
}): Outcome<TransactionInstruction> {
  return buildIx(
    "begin_sweep",
    { release_id: Array.from(input.releaseId) },
    {
      keeper: input.keeper,
      book: bookPda(input.owner),
      owner: input.owner,
      usdc_mint: input.usdcMint,
      owner_usdc: usdcAta(input.owner, input.usdcMint),
      keeper_usdc: usdcAta(input.keeper, input.usdcMint),
      asset_mint: new PublicKey(input.asset.mint),
      owner_asset: assetAta(input.owner, input.asset),
      usdc_program: TOKEN_PROGRAM_ID,
      asset_token_program: tokenProgramFor(input.asset),
      associated_token_program: ASSOCIATED_TOKEN_PROGRAM_ID,
      system_program: SystemProgram.programId,
      instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
    },
  );
}

export function finishSweepIx(input: {
  keeper: PublicKey;
  owner: PublicKey;
  usdcMint: PublicKey;
  asset: Pick<Asset, "mint" | "program">;
  releaseId: Uint8Array;
  priceUpdate: PublicKey;
}): Outcome<TransactionInstruction> {
  const book = bookPda(input.owner);
  return buildIx(
    "finish_sweep",
    { release_id: Array.from(input.releaseId) },
    {
      keeper: input.keeper,
      book,
      owner: input.owner,
      usdc_mint: input.usdcMint,
      owner_usdc: usdcAta(input.owner, input.usdcMint),
      asset_mint: new PublicKey(input.asset.mint),
      owner_asset: assetAta(input.owner, input.asset),
      price_update: input.priceUpdate,
      receipt: receiptPda(book, input.releaseId),
      usdc_program: TOKEN_PROGRAM_ID,
      asset_token_program: tokenProgramFor(input.asset),
      system_program: SystemProgram.programId,
    },
  );
}

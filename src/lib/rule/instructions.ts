import { BN } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createApproveCheckedInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createRevokeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { PublicKey, SystemProgram, type TransactionInstruction } from "@solana/web3.js";
import { type Asset } from "@/lib/assets/registry";
import { USDC_DECIMALS } from "@/lib/assets/registry";
import { validateSlug } from "@/lib/handle";
import { type Outcome, all, held, ok } from "@/lib/outcome";
import { SCRIP_PROGRAM_ID, bookPda, buildIx, handlePda } from "@/lib/solana/program";
import { type RuleTerms, validateRule } from "./slice";

/**
 * THE INSTRUCTIONS THAT WRITE A BOOK AND ITS RULE, and the transactions that carry them.
 *
 * NO PROVIDER, NO WALLET, NO CONNECTION. An instruction is data. What signs it is the
 * browser wallet, at the last moment, holding the only key involved.
 *
 * ORDER IS LOAD-BEARING. The program checks the delegate state INSIDE `enable_rule`, `set_rule`
 * and `disable_rule`, so the token-program instruction that changes it must come first:
 *
 *     enable   [approve_checked, transfer float, enable_rule]
 *     change   [set_rule]                        (delegate already set)
 *     pause    [revoke]                          — the program is not involved and cannot be
 *     resume   [approve_checked, set_rule]       (watermark resets to the current balance)
 *     disable  [revoke, disable_rule]
 *     top up   [approve_checked]                 — the allowance, or a plain transfer for float
 */

export type UsdcMint = { readonly mint: PublicKey; readonly decimals: number };

/** The owner's USDC associated token account. Classic token program, always. */
export function usdcAta(owner: PublicKey, usdcMint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(usdcMint, owner, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

/**
 * THE OWNER'S USDC ACCOUNT, OPENED IN THE SAME SIGNATURE WHEN IT IS MISSING. The rule watches
 * this account and approves the Book as its delegate, so it has to exist before `approve` runs.
 * A wallet that had never held USDC used to be told to go and receive some first — a dead end
 * on step one for exactly the new person the rule is for. Now turning the rule on opens it,
 * idempotently, and the owner pays its rent, which stays theirs like any token account's.
 */
export function openUsdcIfMissing(owner: PublicKey, usdcMint: PublicKey, exists: boolean): TransactionInstruction[] {
  if (exists) return [];
  return [createAssociatedTokenAccountIdempotentInstruction(owner, usdcAta(owner, usdcMint), owner, usdcMint, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)];
}

/** A classic SPL token account (USDC's) is 165 bytes: what its rent is quoted on. */
export const USDC_ACCOUNT_BYTES = 165;

export function tokenProgramFor(asset: Pick<Asset, "program">): PublicKey {
  return asset.program === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
}

/** The owner's associated token account for an asset, on the right token program. */
export function assetAta(owner: PublicKey, asset: Pick<Asset, "mint" | "program">, allowOffCurve = false): PublicKey {
  return getAssociatedTokenAddressSync(
    new PublicKey(asset.mint),
    owner,
    allowOffCurve,
    tokenProgramFor(asset),
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
}

// ── book ─────────────────────────────────────────────────────────────────────────────────

export function openBookIx(input: {
  owner: PublicKey;
  payer?: PublicKey;
  slug: string;
  asset: Pick<Asset, "mint" | "program">;
  usdcMint: PublicKey;
  termsVersion: number;
  /** Who the handle names. A person by default; an organisation pays in stock. */
  kind?: "person" | "org";
}): Outcome<TransactionInstruction> {
  const slug = validateSlug(input.slug);
  if (!slug.ok) return slug;
  if (!Number.isInteger(input.termsVersion) || input.termsVersion < 0 || input.termsVersion > 255) {
    return held("The terms version must be a small whole number.");
  }
  return buildIx(
    "open_book",
    { slug: slug.value, terms_version: input.termsVersion, kind: input.kind === "org" ? { Org: {} } : { Person: {} } },
    {
      owner: input.owner,
      payer: input.payer ?? input.owner,
      book: bookPda(input.owner),
      handle: handlePda(slug.value),
      asset_mint: new PublicKey(input.asset.mint),
      usdc_mint: input.usdcMint,
      system_program: SystemProgram.programId,
    },
  );
}

export function setAssetIx(input: {
  owner: PublicKey;
  asset: Pick<Asset, "mint" | "program">;
  usdcMint: PublicKey;
  termsVersion: number;
}): Outcome<TransactionInstruction> {
  return buildIx(
    "set_asset",
    { terms_version: input.termsVersion },
    {
      owner: input.owner,
      book: bookPda(input.owner),
      asset_mint: new PublicKey(input.asset.mint),
      usdc_mint: input.usdcMint,
      owner_usdc: usdcAta(input.owner, input.usdcMint),
      usdc_program: TOKEN_PROGRAM_ID,
    },
  );
}

export function closeBookIx(owner: PublicKey, slug: string): Outcome<TransactionInstruction> {
  return buildIx("close_book", {}, { owner, book: bookPda(owner), handle: handlePda(slug) });
}

// ── rule ─────────────────────────────────────────────────────────────────────────────────

function ruleArgs(terms: RuleTerms) {
  return {
    rate_bps: terms.rateBps,
    escalate_bps: terms.escalateBps,
    floor_usdc: new BN(terms.floorUsdc.toString()),
    cap_usdc: new BN(terms.capUsdc.toString()),
    tolerance_bps: terms.toleranceBps,
  };
}

function ruleAccounts(owner: PublicKey, usdcMint: PublicKey) {
  return {
    owner,
    book: bookPda(owner),
    usdc_mint: usdcMint,
    owner_usdc: usdcAta(owner, usdcMint),
    usdc_program: TOKEN_PROGRAM_ID,
  };
}

export function enableRuleIx(owner: PublicKey, usdcMint: PublicKey, terms: RuleTerms): Outcome<TransactionInstruction> {
  const v = validateRule(terms);
  if (!v.ok) return v;
  return buildIx("enable_rule", ruleArgs(v.value), ruleAccounts(owner, usdcMint));
}

export function setRuleIx(owner: PublicKey, usdcMint: PublicKey, terms: RuleTerms): Outcome<TransactionInstruction> {
  const v = validateRule(terms);
  if (!v.ok) return v;
  return buildIx("set_rule", ruleArgs(v.value), ruleAccounts(owner, usdcMint));
}

export function disableRuleIx(owner: PublicKey, usdcMint: PublicKey): Outcome<TransactionInstruction> {
  return buildIx("disable_rule", {}, ruleAccounts(owner, usdcMint));
}

export function syncWatermarkIx(owner: PublicKey, usdcMint: PublicKey): Outcome<TransactionInstruction> {
  return buildIx(
    "sync_watermark",
    {},
    { book: bookPda(owner), owner, usdc_mint: usdcMint, owner_usdc: usdcAta(owner, usdcMint), usdc_program: TOKEN_PROGRAM_ID },
  );
}

export function withdrawFloatIx(owner: PublicKey, lamports: bigint): Outcome<TransactionInstruction> {
  if (lamports <= 0n) return held("Nothing to withdraw.");
  return buildIx("withdraw_float", { lamports: new BN(lamports.toString()) }, { owner, book: bookPda(owner) });
}

/** `approve_checked(delegate = Book, amount = allowance)` on the owner's USDC account. */
export function approveIx(owner: PublicKey, usdcMint: PublicKey, allowanceUsdc: bigint): TransactionInstruction {
  return createApproveCheckedInstruction(
    usdcAta(owner, usdcMint),
    usdcMint,
    bookPda(owner),
    owner,
    allowanceUsdc,
    USDC_DECIMALS,
    [],
    TOKEN_PROGRAM_ID,
  );
}

/** `revoke` on the owner's USDC account. THE PAUSE. The program is not in this instruction. */
export function revokeIx(owner: PublicKey, usdcMint: PublicKey): TransactionInstruction {
  return createRevokeInstruction(usdcAta(owner, usdcMint), owner, [], TOKEN_PROGRAM_ID);
}

/** A plain system transfer to the Book's address. THE FLOAT DEPOSIT. */
export function depositFloatIx(owner: PublicKey, lamports: bigint): TransactionInstruction {
  return SystemProgram.transfer({ fromPubkey: owner, toPubkey: bookPda(owner), lamports });
}

// ── the composed transactions ────────────────────────────────────────────────────────────

/** Turn on: approve, float, enable. One signature. */
export function enableRuleIxs(input: {
  owner: PublicKey;
  usdcMint: PublicKey;
  terms: RuleTerms;
  allowanceUsdc: bigint;
  floatLamports: bigint;
}): Outcome<TransactionInstruction[]> {
  if (input.allowanceUsdc <= 0n) return held("Set an allowance greater than zero.");
  const enable = enableRuleIx(input.owner, input.usdcMint, input.terms);
  if (!enable.ok) return enable;
  const ixs = [approveIx(input.owner, input.usdcMint, input.allowanceUsdc)];
  if (input.floatLamports > 0n) ixs.push(depositFloatIx(input.owner, input.floatLamports));
  ixs.push(enable.value);
  return ok(ixs);
}

/** Change the terms. The delegate stays as it is. */
export function changeRuleIxs(owner: PublicKey, usdcMint: PublicKey, terms: RuleTerms): Outcome<TransactionInstruction[]> {
  return all([setRuleIx(owner, usdcMint, terms)]);
}

/** Pause: revoke, and nothing else. Scrip cannot stop you. */
export function pauseIxs(owner: PublicKey, usdcMint: PublicKey): TransactionInstruction[] {
  return [revokeIx(owner, usdcMint)];
}

/** Resume: approve again, then set_rule with the same terms so the watermark resets. */
export function resumeIxs(input: {
  owner: PublicKey;
  usdcMint: PublicKey;
  terms: RuleTerms;
  allowanceUsdc: bigint;
}): Outcome<TransactionInstruction[]> {
  if (input.allowanceUsdc <= 0n) return held("Set an allowance greater than zero.");
  const set = setRuleIx(input.owner, input.usdcMint, input.terms);
  if (!set.ok) return set;
  return ok([approveIx(input.owner, input.usdcMint, input.allowanceUsdc), set.value]);
}

/** Turn off: revoke, then disable. */
export function disableRuleIxs(owner: PublicKey, usdcMint: PublicKey): Outcome<TransactionInstruction[]> {
  const disable = disableRuleIx(owner, usdcMint);
  if (!disable.ok) return disable;
  return ok([revokeIx(owner, usdcMint), disable.value]);
}

/** Re-approve a larger allowance without touching the rule. */
export function topUpAllowanceIxs(owner: PublicKey, usdcMint: PublicKey, allowanceUsdc: bigint): Outcome<TransactionInstruction[]> {
  if (allowanceUsdc <= 0n) return held("Set an allowance greater than zero.");
  return ok([approveIx(owner, usdcMint, allowanceUsdc)]);
}

export { SCRIP_PROGRAM_ID };

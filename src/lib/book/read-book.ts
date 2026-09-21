import "server-only";

import { type Connection, PublicKey } from "@solana/web3.js";
import { unpackAccount } from "@solana/spl-token";
import { type Asset, USDC_MINT, ruleAssets } from "@/lib/assets/registry";
import { resolveAsset } from "@/lib/assets/stand-in";
import { multiplierInForce, noMultiplier } from "@/lib/corporate-actions/multiplier";
import { readMintMultiplier } from "@/lib/corporate-actions/read-mint";
import { mulBase } from "@/lib/money";
import { type Outcome, attempt, held, ok } from "@/lib/outcome";
import { assetAta, tokenProgramFor, usdcAta } from "@/lib/rule/instructions";
import { MIN_SLICE, SWEEP_COST_LAMPORTS, effectiveRate } from "@/lib/rule/slice";
import { cluster } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID, bookPda, handlePda } from "@/lib/solana/program";
import { type Book, decodeBook, decodeHandle } from "./decode";
import { rentFor } from "@/lib/solana/rent";

/**
 * READ A BOOK OFF THE CHAIN — the rule, the delegate state on the owner's own USDC account,
 * the float, and the holdings, in as few round trips as the answer allows.
 *
 * EVERY STEP CAN HOLD SEPARATELY. A multiplier that cannot be read must not be assumed to be
 * one, because assuming one is assuming no corporate action ever happened; the raw balance
 * is shown and the surface says the adjustment is unknown.
 */

/** Everything a rule card has to be able to say. */
export type RuleState =
  | "on"
  | "paused"
  | "delegate-replaced"
  | "allowance-exhausted"
  | "float-empty"
  | "no-usdc-account"
  | "off";

export type Holding = {
  readonly asset: Asset;
  readonly qtyRaw: bigint;
  /** raw × live multiplier — the share-equivalents. Equal to raw when there is no multiplier. */
  readonly qtyAdjusted: bigint;
  readonly multiplier: string;
  readonly pendingMultiplier: { readonly value: string; readonly effectiveAt: number } | null;
  readonly heldWhy: string | null;
};

export type BookView = {
  readonly owner: string;
  readonly pda: string;
  /** null when no book has been opened. */
  readonly book: Book | null;
  readonly asset: Asset | null;
  readonly usdc: {
    readonly exists: boolean;
    readonly balance: bigint;
    readonly delegate: string | null;
    readonly delegatedAmount: bigint;
  };
  readonly floatLamports: bigint;
  readonly rentLamports: bigint;
  readonly state: RuleState;
  /** The rate in force now, after escalation. */
  readonly rateNowBps: number;
  readonly sweepsCovered: number;
  readonly holdings: readonly Holding[];
  readonly holds: readonly string[];
};

/** The pay-in mint for this cluster. Devnet books carry their own; mainnet is always USDC. */
export function usdcMintFor(book: Book | null): PublicKey {
  if (book) return new PublicKey(book.usdcMint);
  const fromEnv = process.env.NEXT_PUBLIC_DEVNET_USDC_MINT?.trim();
  if (cluster() !== "mainnet-beta" && fromEnv) return new PublicKey(fromEnv);
  return new PublicKey(USDC_MINT);
}

export async function loadBook(ownerAddress: string, now: number = Math.floor(Date.now() / 1000)): Promise<Outcome<BookView>> {
  return attempt("this register", () => readBookView(ownerAddress, now));
}

async function readBookView(ownerAddress: string, now: number): Promise<Outcome<BookView>> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerAddress);
  } catch {
    return held("That is not a Solana address.");
  }
  const conn = connection();
  const pda = bookPda(owner);
  const holds: string[] = [];

  // ── the book, first, because the pay-in mint and the asset come from it ──────────────
  let bookInfo;
  try {
    bookInfo = await conn.getAccountInfo(pda, "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  let book: Book | null = null;
  if (bookInfo && bookInfo.owner.equals(SCRIP_PROGRAM_ID)) {
    const decoded = decodeBook(bookInfo.data);
    if (decoded.ok) book = decoded.value;
    else holds.push(decoded.why);
  }
  // The registry on mainnet; on devnet, a mint the registry does not know is read from the
  // chain and labelled a stand-in. A mainnet book against an unknown mint stays held.
  const asset: Asset | null = book ? await resolveAsset(book.asset, conn) : null;
  if (book && !asset) holds.push(`This book's asset ${book.asset.slice(0, 6)}… is not on the registry.`);
  const usdcMint = usdcMintFor(book);

  // ── one round trip for the USDC account and every holding ────────────────────────────
  const assets = cluster() === "mainnet-beta" || !asset ? ruleAssets() : [asset];
  const wanted = [usdcAta(owner, usdcMint), ...assets.map((a) => assetAta(owner, a))];
  let infos;
  try {
    infos = await conn.getMultipleAccountsInfo(wanted, "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }

  let usdc: BookView["usdc"] = { exists: false, balance: 0n, delegate: null, delegatedAmount: 0n };
  const usdcInfo = infos[0];
  if (usdcInfo) {
    try {
      const acct = unpackAccount(wanted[0]!, usdcInfo, usdcInfo.owner);
      usdc = {
        exists: true,
        balance: acct.amount,
        delegate: acct.delegate ? acct.delegate.toBase58() : null,
        delegatedAmount: acct.delegatedAmount,
      };
    } catch {
      holds.push("The USDC account could not be decoded.");
    }
  }

  const rawByMint = new Map<string, bigint>();
  assets.forEach((a, i) => {
    const info = infos[i + 1];
    if (!info) return;
    try {
      rawByMint.set(a.mint, unpackAccount(wanted[i + 1]!, info, tokenProgramFor(a)).amount);
    } catch {
      holds.push(`${a.symbol}: its token account could not be decoded.`);
    }
  });

  // ── multipliers, only for held mints that carry one ──────────────────────────────────
  const holdings: Holding[] = [];
  for (const a of assets) {
    const raw = rawByMint.get(a.mint) ?? 0n;
    if (raw === 0n && a.mint !== asset?.mint) continue;
    if (!a.powers.hasMultiplier) {
      holdings.push({ asset: a, qtyRaw: raw, qtyAdjusted: raw, multiplier: "1", pendingMultiplier: null, heldWhy: null });
      continue;
    }
    const read = await readMintMultiplier(conn, a, now);
    let why: string | null = null;
    let live = noMultiplier();
    if (!read.ok) why = read.why;
    else if (read.value.kind === "scaled") {
      const resolved = multiplierInForce(read.value.snapshot, now);
      if (!resolved.ok) why = resolved.why;
      else live = resolved.value;
    }
    if (why) holds.push(why);
    holdings.push({
      asset: a,
      qtyRaw: raw,
      // NEVER 1 AS A FALLBACK. The raw balance is shown and the surface says why.
      qtyAdjusted: why ? raw : mulBase(raw, live.value),
      multiplier: why ? "unknown" : live.raw,
      pendingMultiplier: live.pending ? { value: live.pending.raw, effectiveAt: live.pending.effectiveAt } : null,
      heldWhy: why,
    });
  }

  // ── the float and the state ──────────────────────────────────────────────────────────
  const rentLamports = bookInfo ? await rentFor(conn, bookInfo.data.length) : 0n;
  const floatLamports = bookInfo ? BigInt(bookInfo.lamports) - rentLamports : 0n;
  const state = ruleState(book, usdc, pda.toBase58(), floatLamports);
  const rateNowBps = book?.rule.enabled
    ? effectiveRate(book.rule.rateBps, book.rule.escalateBps, book.rule.enabledUnix, now)
    : 0;

  return ok({
    owner: ownerAddress,
    pda: pda.toBase58(),
    book,
    asset,
    usdc,
    floatLamports: floatLamports < 0n ? 0n : floatLamports,
    rentLamports,
    state,
    rateNowBps,
    sweepsCovered: Number((floatLamports > 0n ? floatLamports : 0n) / SWEEP_COST_LAMPORTS),
    holdings,
    holds: [...new Set(holds)],
  });
}

/**
 * The state the rule card must render. Decided from chain facts, in the order a person
 * would want to hear them: is it on; can it draw; can it pay for itself.
 */
export function ruleState(book: Book | null, usdc: BookView["usdc"], pda: string, floatLamports: bigint): RuleState {
  if (!book || !book.rule.enabled) return "off";
  if (!usdc.exists) return "no-usdc-account";
  if (usdc.delegate === null || usdc.delegatedAmount === 0n) return "paused";
  if (usdc.delegate !== pda) return "delegate-replaced";
  if (usdc.delegatedAmount < MIN_SLICE) return "allowance-exhausted";
  if (floatLamports < SWEEP_COST_LAMPORTS) return "float-empty";
  return "on";
}

/** Resolve a handle to its owner. null when nobody has it. */
export async function resolveHandle(slug: string): Promise<Outcome<string | null>> {
  const conn = connection();
  let info;
  try {
    info = await conn.getAccountInfo(handlePda(slug), "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!info || !info.owner.equals(SCRIP_PROGRAM_ID)) return ok(null);
  const h = decodeHandle(info.data);
  return h.ok ? ok(h.value.owner) : held(h.why);
}

/** A handle with who it names: a person or an organisation. null when nobody has it. */
export async function readHandle(slug: string): Promise<Outcome<{ owner: string; kind: "person" | "org" } | null>> {
  const conn = connection();
  let info;
  try {
    info = await conn.getAccountInfo(handlePda(slug), "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!info || !info.owner.equals(SCRIP_PROGRAM_ID)) return ok(null);
  const h = decodeHandle(info.data);
  return h.ok ? ok({ owner: h.value.owner, kind: h.value.kind }) : held(h.why);
}

/** A book by owner, or null. One account read. */
export async function readBookOf(conn: Connection, owner: PublicKey): Promise<Outcome<Book | null>> {
  let info;
  try {
    info = await conn.getAccountInfo(bookPda(owner), "confirmed");
  } catch (err) {
    return held(`Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`);
  }
  if (!info || !info.owner.equals(SCRIP_PROGRAM_ID)) return ok(null);
  const b = decodeBook(info.data);
  return b.ok ? ok(b.value) : held(b.why);
}


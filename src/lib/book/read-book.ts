import "server-only";

import { Connection, PublicKey } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  unpackAccount,
} from "@solana/spl-token";
import { ASSETS, type Asset } from "@/lib/assets/registry";
import { multiplierInForce, noMultiplier } from "@/lib/corporate-actions/multiplier";
import { readMintMultiplier } from "@/lib/corporate-actions/read-mint";
import { type Decimal, formatDecimal, mulBase } from "@/lib/money";
import { type Outcome, held, ok } from "@/lib/outcome";
import type { Price } from "@/lib/pyth/price";
import { readPrice } from "@/lib/pyth/read";
import { type Policy, parsePolicy } from "@/lib/policy";
import { rpcUrl } from "@/lib/solana/cluster";
import { WEBGOLD_PROGRAM_ID, bookPda } from "@/lib/solana/program";
import { type BookValue, type Holding, valueBook } from "@/lib/valuer";

/**
 * READ A BOOK OFF THE CHAIN — balances from the owner's own token accounts, quantities
 * through the issuer multiplier, values from Pyth.
 *
 * The whole read is three round trips regardless of how many assets exist: one batched
 * account fetch for every token account, one for every mint, one for every price feed. A
 * page that opens N connections per asset is a page that gets slower as the product succeeds.
 *
 * EVERY STEP CAN HOLD SEPARATELY. A gold price that cannot be read must not blank a balance
 * we can see perfectly well; a multiplier that cannot be read must not be assumed to be 1,
 * because assuming 1 is assuming no corporate action ever happened.
 */

export type BookPosition = {
  readonly asset: Asset;
  readonly qtyRaw: bigint;
  readonly qtyAdjusted: bigint;
  /** The multiplier used, so a surface can say why a quantity differs from the raw balance. */
  readonly multiplier: string;
  /** A published change that has not activated yet. */
  readonly pendingMultiplier: { readonly value: string; readonly effectiveAt: number } | null;
  /** Set when the quantity could not be adjusted honestly. The raw balance is still shown. */
  readonly heldWhy: string | null;
};

export type BookView = {
  readonly owner: string;
  /** The Book PDA address — derivable by anyone, whether or not it exists yet. */
  readonly pda: string;
  /** The signed policy, or null when no book has been opened. */
  readonly policy: Policy | null;
  readonly openedAt: number | null;
  readonly positions: readonly BookPosition[];
  readonly value: BookValue;
  /** Things that could not be read. Shown, never swallowed. */
  readonly holds: readonly string[];
};

export function connection(): Connection {
  return new Connection(rpcUrl(), "confirmed");
}

/**
 * The associated token account for an owner and a mint.
 *
 * The token PROGRAM is part of the derivation, so a Token-2022 mint's ATA is at a different
 * address from a classic one's. Deriving both with the same program id finds nothing, and
 * "nothing" is indistinguishable from "no balance" — a silent zero on somebody's savings.
 */
function ata(owner: PublicKey, asset: Asset): PublicKey {
  const programId = asset.program === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), programId.toBuffer(), new PublicKey(asset.mint).toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

export async function loadBook(
  ownerAddress: string,
  now: number = Math.floor(Date.now() / 1000),
  assets: readonly Asset[] = ASSETS,
): Promise<Outcome<BookView>> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerAddress);
  } catch {
    return held("That is not a Solana address.");
  }

  const conn = connection();
  const holds: string[] = [];
  const pda = bookPda(owner);

  // ── one round trip for the book account and every token account ──────────────────
  const tokenAccounts = assets.map((a) => ata(owner, a));
  let infos;
  try {
    infos = await conn.getMultipleAccountsInfo([pda, ...tokenAccounts], "confirmed");
  } catch (err) {
    return held(
      `Could not reach Solana (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  const bookInfo = infos[0];
  let policy: Policy | null = null;
  let openedAt: number | null = null;
  if (bookInfo && bookInfo.owner.equals(WEBGOLD_PROGRAM_ID)) {
    const decoded = decodeBook(bookInfo.data);
    if (decoded.ok) {
      const parsed = parsePolicy(decoded.value.policyJson);
      if (parsed.ok) {
        policy = parsed.value;
        openedAt = decoded.value.openedAt;
      } else {
        holds.push(`This book's stored policy could not be read: ${parsed.why}`);
      }
    } else {
      holds.push(decoded.why);
    }
  }

  const rawByMint = new Map<string, bigint>();
  assets.forEach((asset, i) => {
    const info = infos[i + 1];
    if (!info) return; // no token account is a zero balance, not a failure
    try {
      const acct = unpackAccount(tokenAccounts[i]!, info, info.owner);
      rawByMint.set(asset.mint, acct.amount);
    } catch {
      holds.push(`${asset.symbol}: its token account could not be decoded.`);
    }
  });

  // ── multipliers, only for the mints that carry one ───────────────────────────────
  const positions: BookPosition[] = [];
  for (const asset of assets) {
    const raw = rawByMint.get(asset.mint) ?? 0n;
    if (!asset.hasMultiplier) {
      positions.push({
        asset,
        qtyRaw: raw,
        qtyAdjusted: raw,
        multiplier: "1",
        pendingMultiplier: null,
        heldWhy: null,
      });
      continue;
    }

    const read = await readMintMultiplier(conn, asset, now);
    let live: Decimal | null = null;
    let raws = "1";
    let pending: BookPosition["pendingMultiplier"] = null;
    let why: string | null = null;

    if (!read.ok) {
      why = read.why;
    } else if (read.value.kind === "unscaled") {
      live = noMultiplier().value;
    } else {
      const resolved = multiplierInForce(read.value.snapshot, now);
      if (!resolved.ok) why = resolved.why;
      else {
        live = resolved.value.value;
        raws = resolved.value.raw;
        pending = resolved.value.pending
          ? { value: resolved.value.pending.raw, effectiveAt: resolved.value.pending.effectiveAt }
          : null;
      }
    }

    if (why) holds.push(why);
    positions.push({
      asset,
      qtyRaw: raw,
      // NEVER 1 AS A FALLBACK. Assuming a multiplier of one is assuming no corporate action
      // ever happened, which on a rebasing mint is a wrong quantity wearing a confident face.
      // The raw balance is shown and the surface says the adjustment is unknown.
      qtyAdjusted: live ? mulBase(raw, live) : raw,
      multiplier: live ? raws : "unknown",
      pendingMultiplier: pending,
      heldWhy: why,
    });
  }

  // ── prices ───────────────────────────────────────────────────────────────────────
  const prices = new Map<string, Outcome<Price>>();
  for (const asset of assets) {
    // Skip a price call for a position that does not exist. The commonest book holds two of
    // these five assets, and an RPC round trip for a zero balance is a round trip for nothing.
    if ((rawByMint.get(asset.mint) ?? 0n) === 0n) continue;
    prices.set(asset.mint, await readPrice(conn, asset.price));
  }

  const holdings: Holding[] = positions
    .filter((p) => p.qtyRaw > 0n)
    .map((p) => ({ asset: p.asset, qtyRaw: p.qtyRaw, qtyAdjusted: p.qtyAdjusted }));

  const value = valueBook(holdings, prices, "display", now);
  for (const h of value.heldLegs) holds.push(h.why);

  return ok({
    owner: ownerAddress,
    pda: pda.toBase58(),
    policy,
    openedAt,
    positions,
    value,
    holds: [...new Set(holds)],
  });
}

/**
 * A recipient's signed policy, or null when they have not opened a book.
 *
 * One account read. `loadBook` does the same thing on the way to doing five other things, and
 * a payer quoting a payout needs only this — the recipient's balances are none of their
 * business, and reading them to answer a question about weights would be a surface nobody
 * asked for.
 */
export async function readPolicyOf(
  conn: Connection,
  owner: PublicKey,
): Promise<Policy | null> {
  const info = await conn.getAccountInfo(bookPda(owner), "confirmed");
  if (!info || !info.owner.equals(WEBGOLD_PROGRAM_ID)) return null;
  const decoded = decodeBook(info.data);
  if (!decoded.ok) return null;
  const parsed = parsePolicy(decoded.value.policyJson);
  return parsed.ok ? parsed.value : null;
}

/**
 * Decode the on-chain `Book` account.
 *
 * Hand-decoded rather than routed through an Anchor client: reading one account should not
 * require a Provider, a Wallet and a signer on a page that is only looking. The layout comes
 * from the program's own struct order, and `program.test.ts` already guards the id.
 */
function decodeBook(data: Uint8Array): Outcome<{ openedAt: number; policyJson: string }> {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 8; // anchor discriminator
    o += 32; // owner
    o += 1; // bump
    o += 1; // version
    const openedAt = Number(view.getBigInt64(o, true));
    o += 8;
    o += 8; // lifetime_received
    o += 8; // lifetime_sent
    const legCount = view.getUint32(o, true);
    o += 4;
    if (legCount > 8) return held("This book's policy claims more legs than the program allows.");
    const legs: Array<{ mint: string; bps: number }> = [];
    for (let i = 0; i < legCount; i += 1) {
      const mint = new PublicKey(data.slice(o, o + 32)).toBase58();
      o += 32;
      const bps = view.getUint16(o, true);
      o += 2;
      legs.push({ mint, bps });
    }
    const driftBps = view.getUint16(o, true);
    return ok({ openedAt, policyJson: JSON.stringify({ legs, driftBps }) });
  } catch {
    return held("This book's account could not be decoded.");
  }
}

/** Grams as a plain number for display. */
export function gramsNumber(value: BookValue): number {
  return Number(formatDecimal(value.grams));
}

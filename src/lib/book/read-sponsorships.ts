import "server-only";

import { PublicKey } from "@solana/web3.js";
import idlJson from "@/lib/anchor/webgold.json";
import { assetByMint } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { WEBGOLD_PROGRAM_ID, payoutPda } from "@/lib/solana/program";
import { connection } from "./read-book";

/**
 * SPONSORED FIRST POSITIONS — payouts that name no recipient, waiting for whoever turns up.
 *
 * A payout funded with the default pubkey as its recipient is a claim path: an issuer funds
 * first grams into a book that does not exist yet. Finding them is one `getProgramAccounts`
 * filtered on the Payout discriminator AND on thirty-two zero bytes at the recipient offset,
 * which is narrow enough that the RPC returns only these.
 *
 * The list is PUBLIC on purpose. A sponsored position nobody can find is not an acquisition
 * device, it is a private airdrop.
 */

const PAYOUT_DISCRIMINATOR: number[] | null =
  (idlJson as { accounts?: Array<{ name: string; discriminator: number[] }> }).accounts?.find(
    (a) => a.name === "Payout",
  )?.discriminator ?? null;

/** Where `recipient` sits in a Payout account: 8 discriminator + 32 payer. */
const RECIPIENT_OFFSET = 40;

export type SponsoredLeg = {
  readonly mint: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly amount: bigint;
};

export type Sponsored = {
  readonly address: string;
  readonly sponsor: string;
  readonly nonce: string;
  readonly releaseId: string;
  readonly valueBase: bigint;
  readonly gramsE8: bigint;
  readonly reason: string;
  readonly fundedAt: number;
  readonly legs: readonly SponsoredLeg[];
};

export async function readSponsored(limit = 12): Promise<Outcome<Sponsored[]>> {
  if (!PAYOUT_DISCRIMINATOR) return held("The committed IDL has no Payout account in it.");

  const conn = connection();
  let accounts;
  try {
    accounts = await conn.getProgramAccounts(WEBGOLD_PROGRAM_ID, {
      commitment: "confirmed",
      filters: [
        { memcmp: { offset: 0, bytes: toBase58(Uint8Array.from(PAYOUT_DISCRIMINATOR)) } },
        // Thirty-two zero bytes: the default pubkey, which is what "no recipient" looks like.
        { memcmp: { offset: RECIPIENT_OFFSET, bytes: PublicKey.default.toBase58() } },
      ],
    });
  } catch (err) {
    return held(
      `Could not read sponsored positions (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  const out: Sponsored[] = [];
  for (const { pubkey, account } of accounts) {
    const decoded = decodePayout(account.data);
    if (!decoded.ok) continue; // one we cannot read is skipped, never guessed at
    // Already claimed. The account survives the claim as the record of it.
    if (decoded.value.releasedAt !== 0) continue;

    // Re-derive the address from the payer and nonce we just decoded. An account that does
    // not sit where its own contents say it should is not the account it claims to be.
    let sponsor: PublicKey;
    try {
      sponsor = new PublicKey(decoded.value.sponsor);
    } catch {
      continue;
    }
    if (!payoutPda(sponsor, decoded.value.nonce).equals(pubkey)) continue;

    out.push({
      address: pubkey.toBase58(),
      sponsor: decoded.value.sponsor,
      nonce: decoded.value.nonce.toString(),
      releaseId: decoded.value.releaseId,
      valueBase: decoded.value.valueBase,
      gramsE8: decoded.value.gramsE8,
      reason: decoded.value.reason,
      fundedAt: decoded.value.fundedAt,
      legs: decoded.value.legs,
    });
  }

  out.sort((a, b) => b.fundedAt - a.fundedAt);
  return ok(out.slice(0, limit));
}

function decodePayout(data: Uint8Array): Outcome<{
  sponsor: string;
  nonce: bigint;
  releaseId: string;
  valueBase: bigint;
  gramsE8: bigint;
  reason: string;
  fundedAt: number;
  releasedAt: number;
  legs: SponsoredLeg[];
}> {
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 8;
    const sponsor = new PublicKey(data.slice(o, o + 32)).toBase58();
    o += 32;
    o += 32; // recipient — the default pubkey, which is why this account is in the list
    const nonce = view.getBigUint64(o, true);
    o += 8;
    o += 1; // bump
    const releaseId = [...data.slice(o, o + 32)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    o += 32;
    const valueBase = view.getBigUint64(o, true);
    o += 8;
    const gramsE8 = view.getBigUint64(o, true);
    o += 8;
    const reasonLen = view.getUint32(o, true);
    o += 4;
    if (reasonLen > 200) return held("a payout's reason is longer than the program allows");
    const reason = new TextDecoder().decode(data.slice(o, o + reasonLen));
    o += reasonLen;
    const fundedAt = Number(view.getBigInt64(o, true));
    o += 8;
    const releasedAt = Number(view.getBigInt64(o, true));
    o += 8;
    const legCount = view.getUint32(o, true);
    o += 4;
    if (legCount > 8) return held("a payout claims more legs than the program allows");
    const legs: SponsoredLeg[] = [];
    for (let i = 0; i < legCount; i += 1) {
      const mint = new PublicKey(data.slice(o, o + 32)).toBase58();
      o += 32;
      const amount = view.getBigUint64(o, true);
      o += 8;
      const asset = assetByMint(mint);
      legs.push({
        mint,
        symbol: asset?.symbol ?? `${mint.slice(0, 4)}…`,
        name: asset?.name ?? "Unrecognised mint",
        decimals: asset?.decimals ?? 0,
        amount,
      });
    }
    return ok({ sponsor, nonce, releaseId, valueBase, gramsE8, reason, fundedAt, releasedAt, legs });
  } catch {
    return held("a payout account could not be decoded");
  }
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function toBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

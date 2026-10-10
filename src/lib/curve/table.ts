import { METAPLEX_PROGRAM_ID, deriveDbcEventAuthority, deriveDbcPoolAuthority } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { type AddressLookupTableAccount, ComputeBudgetProgram, type Connection, PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from "@solana/web3.js";
import { type Deployed, configsOf } from "./deployed";
import { CURVE_STOCKS, DBC_PROGRAM_ID, curveQuote, tokenBadge } from "./preset";

/**
 * SCRIP CURVE'S LOOKUP TABLE — the accounts every launch and every buy names that never change:
 * the programs, DBC's pool and event authorities, the four stocks and Meteora's badge for each,
 * and every config. A launch with its first buy names all of them; written into a lookup table
 * each costs one byte instead of thirty-two, which leaves the room Phantom asks for under the
 * 1,232-byte limit to add its own checks. Created and extended by `curve.ts setup`.
 */
export function curveTableAddresses(d: Deployed): PublicKey[] {
  const out = [
    DBC_PROGRAM_ID,
    deriveDbcPoolAuthority(),
    deriveDbcEventAuthority(),
    METAPLEX_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    SystemProgram.programId,
    ComputeBudgetProgram.programId,
    SYSVAR_RENT_PUBKEY,
  ];
  for (const s of CURVE_STOCKS) {
    const mint = new PublicKey(curveQuote(s).mint);
    out.push(mint, tokenBadge(DBC_PROGRAM_ID, mint));
  }
  for (const c of configsOf(d)) out.push(new PublicKey(c.address));
  const seen = new Set<string>();
  return out.filter((k) => (seen.has(k.toBase58()) ? false : (seen.add(k.toBase58()), true)));
}

/** The table, read now: none when there is none yet or it cannot be read (a transaction then names every account in full). */
export async function curveTable(conn: Connection, address: string | null | undefined): Promise<AddressLookupTableAccount[]> {
  if (!address) return [];
  try {
    const t = await conn.getAddressLookupTable(new PublicKey(address), { commitment: "confirmed" });
    return t.value ? [t.value] : [];
  } catch {
    return [];
  }
}

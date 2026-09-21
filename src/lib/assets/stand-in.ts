import "server-only";

import { ExtensionType, TOKEN_2022_PROGRAM_ID, getExtensionTypes, unpackMint } from "@solana/spl-token";
import { type Connection, PublicKey } from "@solana/web3.js";
import { cluster } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import { type Asset, assetByMint, standInAsset } from "./registry";

/**
 * RESOLVE A MINT TO AN ASSET, ON ANY CLUSTER.
 *
 * On mainnet the registry is the only answer: a mint it does not know is not an asset Scrip
 * will describe. On devnet the e2e battery and the demo script mint stand-ins, and every
 * surface that meets one — the home screen, the ledger, the receipt — labels it as a
 * stand-in with its decimals read from the mint itself, once per process.
 */
const cache = new Map<string, Promise<Asset | null>>();

export function resolveAsset(mint: string, conn: Connection = connection()): Promise<Asset | null> {
  const known = assetByMint(mint);
  if (known) return Promise.resolve(known);
  if (cluster() === "mainnet-beta") return Promise.resolve(null);
  let hit = cache.get(mint);
  if (!hit) {
    hit = readStandIn(mint, conn);
    cache.set(mint, hit);
    // A failed read is not a fact about the mint; let the next caller try again.
    void hit.then((a) => {
      if (!a) cache.delete(mint);
    });
  }
  return hit;
}

async function readStandIn(mint: string, conn: Connection): Promise<Asset | null> {
  try {
    const key = new PublicKey(mint);
    const info = await conn.getAccountInfo(key, "confirmed");
    if (!info) return null;
    const program = info.owner.equals(TOKEN_2022_PROGRAM_ID) ? ("token-2022" as const) : ("spl-token" as const);
    const m = unpackMint(key, info, info.owner);
    const scaled = program === "token-2022" && getExtensionTypes(m.tlvData).includes(ExtensionType.ScaledUiAmountConfig);
    return standInAsset(mint, m.decimals, program, scaled);
  } catch {
    return null;
  }
}

/** The same, for a set of mints at once — the ledger's wall. */
export async function resolveAssets(mints: Iterable<string>, conn: Connection = connection()): Promise<Map<string, Asset>> {
  const out = new Map<string, Asset>();
  await Promise.all(
    [...new Set(mints)].map(async (mint) => {
      const a = await resolveAsset(mint, conn);
      if (a) out.set(mint, a);
    }),
  );
  return out;
}

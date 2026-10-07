import "server-only";

import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { prices as jupPrices } from "@/lib/jupiter/client";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { type SaveStock, catalogue } from "./catalogue";

/**
 * EVERY STOCK IN A WALLET — read from the wallet's own token accounts under both token
 * programs, and kept only where the mint is in the catalogue, so a stranger's airdrop never
 * appears as savings. Two reads, however many stocks the catalogue lists.
 *
 * Units are the token's own (raw over decimals): the figure every receipt prints, so the
 * receipts of a wallet that has only saved add up to what is shown here. The dollar value is
 * Jupiter's display price, labelled wherever it is drawn; nothing settles against it.
 */
export type StockHolding = {
  readonly stock: SaveStock;
  readonly raw: bigint;
  /** Jupiter's price per unit, for display; null when it has none. */
  readonly usdPrice: number | null;
  readonly usdValue: number | null;
};

type ParsedInfo = { mint?: string; tokenAmount?: { amount?: string } };

export async function readStockHoldings(owner: string): Promise<Outcome<StockHolding[]>> {
  let key: PublicKey;
  try {
    key = new PublicKey(owner);
  } catch {
    return held("That is not a Solana address.");
  }
  const byMint = new Map(catalogue().map((s) => [s.mint, s] as const));
  const raw = new Map<string, bigint>();
  try {
    const conn = connection();
    const [classic, extended] = await Promise.all([
      conn.getParsedTokenAccountsByOwner(key, { programId: TOKEN_PROGRAM_ID }, "confirmed"),
      conn.getParsedTokenAccountsByOwner(key, { programId: TOKEN_2022_PROGRAM_ID }, "confirmed"),
    ]);
    for (const { account } of [...classic.value, ...extended.value]) {
      const info = (account.data as { parsed?: { info?: ParsedInfo } }).parsed?.info;
      const mint = info?.mint;
      const amount = info?.tokenAmount?.amount;
      if (!mint || !amount || !byMint.has(mint)) continue;
      const n = BigInt(amount);
      if (n > 0n) raw.set(mint, (raw.get(mint) ?? 0n) + n);
    }
  } catch (err) {
    return held(`This wallet could not be read just now (${err instanceof Error ? err.message : String(err)}).`);
  }

  const mints = [...raw.keys()];
  const quoted = mints.length > 0 ? await jupPrices(mints).catch(() => null) : null;
  const priceOf = quoted && quoted.ok ? quoted.value : new Map<string, number>();
  const rows: StockHolding[] = mints.map((mint) => {
    const stock = byMint.get(mint)!;
    const units = raw.get(mint)!;
    const usdPrice = priceOf.get(mint) ?? null;
    return { stock, raw: units, usdPrice, usdValue: usdPrice !== null ? (Number(units) / 10 ** stock.decimals) * usdPrice : null };
  });
  // Largest first; a stock Jupiter cannot price sorts last rather than pretending to be zero.
  rows.sort((a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1));
  return ok(rows);
}

/** What the priced rows are worth together, and how many could not be priced. */
export function worthOf(rows: readonly StockHolding[]): { usd: number; unpriced: number } {
  let usd = 0;
  let unpriced = 0;
  for (const r of rows) {
    if (r.usdValue === null) unpriced += 1;
    else usd += r.usdValue;
  }
  return { usd, unpriced };
}

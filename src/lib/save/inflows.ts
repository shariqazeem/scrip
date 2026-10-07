import "server-only";

import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { USDC_MINT } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";
import { readTxViews } from "@/lib/solana/tx-view";
import { type Inflow, RECENT_DAYS } from "./amount";
import { inflowFrom } from "./balances";

/**
 * WHAT A WALLET WAS PAID LATELY — read from its USDC account's own history.
 *
 * The account's last signatures, then those transactions parsed by the RPC in one batch, any
 * version, then `inflowFrom` on each: a payment is USDC in that the wallet did not sign for.
 * A wallet with no USDC account was never paid in USDC; that is an answer, not an error.
 */

/** How far back a wallet's history is read: enough for a month of a busy freelancer. */
const LOOKBACK = 25;

export type WalletPay = {
  readonly inflows: Inflow[];
  /** USDC the wallet can spend now, base units. */
  readonly usdc: bigint;
  readonly lamports: number;
};

export async function readInflows(ownerB58: string): Promise<Outcome<WalletPay>> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(ownerB58);
  } catch {
    return held("That is not a Solana address.");
  }
  const conn = connection();
  const ata = getAssociatedTokenAddressSync(new PublicKey(USDC_MINT), owner, true, TOKEN_PROGRAM_ID);
  try {
    const [lamports, bal, sigs] = await Promise.all([
      conn.getBalance(owner, "confirmed"),
      conn
        .getTokenAccountBalance(ata, "confirmed")
        .then((r) => BigInt(r.value.amount))
        .catch(() => null),
      conn.getSignaturesForAddress(ata, { limit: LOOKBACK }, "confirmed").catch(() => []),
    ]);
    if (bal === null) return ok({ inflows: [], usdc: 0n, lamports });
    const since = Math.floor(Date.now() / 1000) - RECENT_DAYS * 86_400;
    const recent = sigs.filter((s) => !s.err && (s.blockTime ?? 0) >= since).map((s) => s.signature);
    const views = await readTxViews(conn, recent).catch(() => []);
    const inflows = views.flatMap((v) => {
      const f = v ? inflowFrom(v, owner.toBase58()) : null;
      return f ? [f] : [];
    });
    inflows.sort((a, b) => b.at - a.at);
    return ok({ inflows, usdc: bal, lamports });
  } catch (err) {
    return held(`Could not read this wallet's payments (${err instanceof Error ? err.message : String(err)}).`);
  }
}

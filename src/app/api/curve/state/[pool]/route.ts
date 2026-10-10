import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { launchAt } from "@/lib/curve/launches";
import { curveQuote, feeBpsAt } from "@/lib/curve/preset";
import { connection } from "@/lib/solana/connection";

export const dynamic = "force-dynamic";

/**
 * A LAUNCH, NOW — its curve read from the chain, the trading fee at this second, and, for a
 * wallet that asks, what it holds of the token and of the stock. The launch page polls this
 * after every trade; every number is an account read now, as strings so nothing rounds.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ pool: string }> }) {
  const { pool } = await params;
  const conn = connection();
  const found = await launchAt(conn, pool);
  if (!found.ok) return NextResponse.json({ error: found.why }, { status: 503 });
  const l = found.value;
  if (!l) return NextResponse.json({ error: "That is not a Scrip Curve launch." }, { status: 404 });
  let tokensRaw: string | null = null;
  let stockRaw: string | null = null;
  const ownerParam = req.nextUrl.searchParams.get("owner");
  if (ownerParam) {
    try {
      const owner = new PublicKey(ownerParam);
      const tokenAcc = getAssociatedTokenAddressSync(new PublicKey(l.baseMint), owner, true);
      const stockAcc = getAssociatedTokenAddressSync(new PublicKey(curveQuote(l.stock).mint), owner, true, TOKEN_2022_PROGRAM_ID);
      const [t, s] = await Promise.all([conn.getTokenAccountBalance(tokenAcc, "confirmed").catch(() => null), conn.getTokenAccountBalance(stockAcc, "confirmed").catch(() => null)]);
      tokensRaw = t?.value.amount ?? "0";
      stockRaw = s?.value.amount ?? "0";
    } catch {
      // Not an address: answer the launch without balances.
    }
  }
  return NextResponse.json({
    pool: l.pool,
    stock: l.stock,
    migrated: l.migrated,
    quoteReserveRaw: l.quoteReserveRaw.toString(),
    thresholdRaw: l.thresholdRaw.toString(),
    partnerFeeRaw: l.partnerFeeRaw.toString(),
    feeBps: l.migrated ? 100 : feeBpsAt(Math.floor(Date.now() / 1000) - l.activationUnix),
    tokensRaw,
    stockRaw,
  });
}

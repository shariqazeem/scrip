import { NextResponse } from "next/server";
import { cluster, clusterConfig } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * Everything the browser needs to build a transaction, and nothing it needs a key for.
 * The blockhash comes from here so a paid RPC stays on the server; `programDeployed` comes
 * from here so a wallet never asks somebody to sign against a program that is not there.
 */
export async function GET() {
  const c = cluster();
  try {
    const conn = connection();
    const [{ blockhash, lastValidBlockHeight }, program] = await Promise.all([
      conn.getLatestBlockhash("confirmed"),
      conn.getAccountInfo(SCRIP_PROGRAM_ID, "confirmed"),
    ]);
    return NextResponse.json({
      blockhash,
      lastValidBlockHeight,
      cluster: c,
      clusterLabel: clusterConfig(c).label,
      programDeployed: program !== null && program.executable,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach ${clusterConfig(c).label} (${err instanceof Error ? err.message : String(err)}).` },
      { status: 503 },
    );
  }
}

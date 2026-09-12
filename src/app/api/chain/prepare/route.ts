import { NextResponse } from "next/server";
import { connection } from "@/lib/book/read-book";
import { cluster, clusterConfig } from "@/lib/solana/cluster";
import { WEBGOLD_PROGRAM_ID } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/**
 * Everything the browser needs to build a transaction, and nothing it needs a key for.
 *
 * The blockhash comes from here rather than from the browser so a paid RPC endpoint stays on
 * the server. `programDeployed` comes from here for a better reason: a wallet popup asking
 * somebody to sign a transaction against a program that does not exist is a popup that wastes
 * their fee and their trust. Better to say so before the popup.
 */
export async function GET() {
  const c = cluster();
  try {
    const conn = connection();
    const [{ blockhash, lastValidBlockHeight }, program] = await Promise.all([
      conn.getLatestBlockhash("confirmed"),
      conn.getAccountInfo(WEBGOLD_PROGRAM_ID, "confirmed"),
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
      {
        error: `Could not reach ${clusterConfig(c).label} (${err instanceof Error ? err.message : String(err)}).`,
      },
      { status: 503 },
    );
  }
}

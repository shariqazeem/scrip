import { PublicKey, Transaction } from "@solana/web3.js";
import { type NextRequest, NextResponse } from "next/server";
import { CLAIM_MIN_BALANCE_LAMPORTS, type ClaimMode, type ClaimParams, buildClaim } from "@/lib/claim/build";
import { connection } from "@/lib/solana/connection";
import { claimsSponsored, relayerKeypair, sponsorsPayer } from "@/lib/relayer";

export const dynamic = "force-dynamic";

/**
 * BUILD A CLAIM — sponsored when Scrip's relayer can pay for it, the claimer's own when not.
 *
 *     [compute budget, open_book (if the claimer has none), claim_payout]
 *
 * Nothing here signs. The wallet signs first — the order Phantom requires — and for a
 * sponsored claim /api/relay checks it is still this claim before the relayer co-signs.
 *
 * Who pays is decided here, from two balances, and never leaves a claim at a dead end:
 *
 *   the relayer can pay                     → sponsored: an empty wallet takes a position
 *   it cannot, and the claimer can          → self: one signer, the claimer's own fee
 *   neither can                             → refused, with the numbers, and nothing moves
 *
 * The relayer only sponsors payments from the wallets in SPONSOR_PAYERS (src/lib/relayer.ts):
 * any other payer's recipient claims at their own cost.
 *
 * `mode: "self"` in the request skips the relayer — for a claimer who would rather pay, and
 * for a retry after the relayer ran dry between building and sending.
 */
export async function POST(req: NextRequest) {
  let body: ClaimParams & { mode?: unknown };
  try {
    body = (await req.json()) as ClaimParams & { mode?: unknown };
  } catch {
    return NextResponse.json({ error: "That request could not be read." }, { status: 400 });
  }
  let claimer: PublicKey;
  try {
    claimer = new PublicKey(String(body.claimer ?? ""));
  } catch {
    return NextResponse.json({ error: "That is not a Solana address." }, { status: 400 });
  }

  const relayer = relayerKeypair();
  const conn = connection();
  let relayerLamports = 0;
  let claimerLamports = 0;
  try {
    const infos = await conn.getMultipleAccountsInfo(relayer ? [relayer.publicKey, claimer] : [claimer], "confirmed");
    if (relayer) {
      relayerLamports = infos[0]?.lamports ?? 0;
      claimerLamports = infos[1]?.lamports ?? 0;
    } else {
      claimerLamports = infos[0]?.lamports ?? 0;
    }
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Solana (${err instanceof Error ? err.message : String(err)}).` }, { status: 503 });
  }

  const mode: ClaimMode =
    body.mode !== "self" && relayer && relayerLamports >= CLAIM_MIN_BALANCE_LAMPORTS && sponsorsPayer(String(body.payer ?? "")) ? "sponsored" : "self";
  if (mode === "self" && claimerLamports < CLAIM_MIN_BALANCE_LAMPORTS) {
    const need = (CLAIM_MIN_BALANCE_LAMPORTS / 1e9).toFixed(3);
    const have = (claimerLamports / 1e9).toFixed(4);
    return NextResponse.json(
      {
        error: relayer
          ? !claimsSponsored()
            ? `Claiming costs about ${need} SOL — the network fee and the rent for the accounts it opens in your name, which stay yours. This wallet holds ${have} SOL. Add a little SOL and claim again — this position waits for you; nothing expires.`
            : `${sponsorsPayer(String(body.payer ?? "")) ? "The sponsor cannot cover claims right now" : "Scrip sponsors claims only on payments from organisations it has onboarded"}, and this wallet holds ${have} SOL. Claiming it yourself needs about ${need} SOL. Add SOL and claim again — this position waits for you; nothing expires.`
          : `This deployment does not sponsor claims, and this wallet holds ${have} SOL. Claiming needs about ${need} SOL. Add SOL and claim again — nothing expires.`,
      },
      { status: 402 },
    );
  }

  const built = await buildClaim(conn, body, relayer?.publicKey ?? null, mode);
  if (!built.ok) return NextResponse.json({ error: built.why }, { status: built.status });

  let blockhash: string;
  let lastValidBlockHeight: number;
  try {
    ({ blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed"));
  } catch (err) {
    return NextResponse.json({ error: `Could not reach Solana (${err instanceof Error ? err.message : String(err)}).` }, { status: 503 });
  }
  const tx = new Transaction({ feePayer: built.value.feePayer, blockhash, lastValidBlockHeight }).add(...built.value.instructions);
  return NextResponse.json({
    transactionBase64: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"),
    mode,
    needsClaimKey: built.value.needsClaimKey,
    opensBook: built.value.opensBook,
    asset: built.value.asset,
    escrowRaw: built.value.escrowRaw.toString(),
  });
}

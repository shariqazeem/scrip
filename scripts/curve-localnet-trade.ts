/**
 * A TRADE ON A GRADUATED SCRIP CURVE POOL, ON A LOCAL VALIDATOR ONLY — so the locked partner
 * position earns a fee that `curve.ts fees` can then claim into the Plan. Refuses any RPC that is
 * not local: a trade like this on mainnet would be the founder's own volume, which is never made.
 *
 *   npx tsx scripts/curve-localnet-trade.ts <keypair> <damm pool> <QQQx to spend>
 */
import { readFileSync } from "node:fs";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

const RPC = process.env.SOLANA_MAINNET_RPC ?? "http://127.0.0.1:8899";
async function main() {
  if (!/127\.0\.0\.1|localhost/.test(RPC)) throw new Error("local validator only");
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(process.argv[2]!, "utf8")) as number[]));
  const poolKey = new PublicKey(process.argv[3]!);
  const amountIn = new BN(Math.round(Number(process.argv[4] ?? "0.005") * 1e8));
  const conn = new Connection(RPC, "confirmed");
  const amm = new CpAmm(conn);
  const pool = await amm.fetchPoolState(poolKey);
  const programOf = (flag: number) => (flag === 1 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID);
  const tx = await amm.swap({
    payer: payer.publicKey,
    pool: poolKey,
    inputTokenMint: pool.tokenBMint,
    outputTokenMint: pool.tokenAMint,
    amountIn,
    minimumAmountOut: new BN(0),
    tokenAMint: pool.tokenAMint,
    tokenBMint: pool.tokenBMint,
    tokenAVault: pool.tokenAVault,
    tokenBVault: pool.tokenBVault,
    tokenAProgram: programOf(pool.tokenAFlag),
    tokenBProgram: programOf(pool.tokenBFlag),
    referralTokenAccount: null,
  });
  tx.feePayer = payer.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");
  console.log(`traded ${Number(amountIn.toString()) / 1e8} QQQx on the graduated pool: ${sig}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

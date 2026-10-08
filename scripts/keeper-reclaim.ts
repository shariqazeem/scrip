/**
 * A KEEPER'S RENT, BACK — closes every Pyth price-update account and Wormhole encoded-VAA account
 * this keeper posted and never closed, returning the rent to the keeper. Lists them without
 * `--send`; closes them with it.
 *
 *   npx tsx scripts/keeper-reclaim.ts --key anchor/.keys/keeper1.json [--send]
 *
 * Written on 8 October 2026, when a lookup that threw after each post skipped the close and
 * drained both keepers one attempt at a time. The keeper now closes on every failure; this is
 * for anything left behind. Only accounts whose write authority is this keeper are touched, and
 * only this keeper can sign their close, so the rent can only go back where it came from.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Wallet } from "@coral-xyz/anchor";
import { PythSolanaReceiver, TransactionBuilder } from "@pythnetwork/pyth-solana-receiver";
import { Connection, Keypair } from "@solana/web3.js";

function loadEnvLocal() {
  const p = join(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2]!.replace(/^"|"$/g, "");
  }
}
loadEnvLocal();

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const send = process.argv.includes("--send");
const keyPath = arg("key");
if (!keyPath) throw new Error("--key <keypair file> is required");
const keeper = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8")) as number[]));
const rpc = process.env.SOLANA_MAINNET_RPC?.trim() || process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || "https://api.mainnet-beta.solana.com";
const conn = new Connection(rpc, "confirmed");
const pyth = new PythSolanaReceiver({ connection: conn, wallet: new Wallet(keeper) });

(async () => {
  const me = keeper.publicKey.toBase58();
  const before = await conn.getBalance(keeper.publicKey, "confirmed");
  const [updates, vaas] = await Promise.all([
    conn.getProgramAccounts(pyth.receiver.programId, { filters: [{ memcmp: { offset: 8, bytes: me } }] }),
    conn.getProgramAccounts(pyth.wormhole.programId, { filters: [{ memcmp: { offset: 9, bytes: me } }] }),
  ]);
  const held = [...updates, ...vaas].reduce((n, a) => n + a.account.lamports, 0);
  console.log(`keeper ${me.slice(0, 4)}…${me.slice(-4)}: ${(before / 1e9).toFixed(6)} SOL; left open: ${updates.length} price updates, ${vaas.length} encoded VAAs, holding ${(held / 1e9).toFixed(6)} SOL`);
  if (!send || updates.length + vaas.length === 0) return;

  const ixs = [];
  for (const u of updates) ixs.push(await pyth.buildClosePriceUpdateInstruction(u.pubkey));
  for (const v of vaas) ixs.push(await pyth.buildCloseEncodedVaaInstruction(v.pubkey));
  const txs = await TransactionBuilder.batchIntoVersionedTransactions(keeper.publicKey, conn, ixs, {
    computeUnitPriceMicroLamports: 20_000,
  });
  await pyth.provider.sendAll(txs, { skipPreflight: false, commitment: "confirmed" });
  const after = await conn.getBalance(keeper.publicKey, "confirmed");
  console.log(`closed ${ixs.length}; keeper now ${(after / 1e9).toFixed(6)} SOL (+${((after - before) / 1e9).toFixed(6)})`);
})().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "<rpc>") : err);
  process.exit(1);
});

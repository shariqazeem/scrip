/**
 * STOP AND TAKE BACK THE SOL, SIMULATED FOR ANY SAVER — never signed, never sent. Builds what
 * "Stop and take back" builds (`/api/rule/tx` action "close": revoke Scrip's permission, turn
 * saving off, close the savings record) and simulates it, printing the SOL that would come back.
 *
 *   npx tsx --conditions=react-server scripts/close-dry-run.ts --owner <address>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction } =
    await import("@solana/web3.js");
  const { loadBook, usdcMintFor } = await import("@/lib/book/read-book");
  const { closeBookIx, disableRuleIx, revokeIx } = await import("@/lib/rule/instructions");
  const { bookPda, handlePda } = await import("@/lib/solana/program");
  const { connection } = await import("@/lib/solana/connection");
  const owner = new PublicKey(arg("owner") ?? "");
  const view = await loadBook(owner.toBase58());
  if (!view.ok) throw new Error(view.why);
  const b = view.value.book;
  if (!b) throw new Error("no savings record");
  const usdcMint = usdcMintFor(b);
  const ixs = [];
  const d = view.value.usdc;
  if (d.exists && d.delegate === bookPda(owner).toBase58() && d.delegatedAmount > 0n)
    ixs.push(revokeIx(owner, usdcMint));
  if (b.rule.enabled) {
    const off = disableRuleIx(owner, usdcMint);
    if (!off.ok) throw new Error(off.why);
    ixs.push(off.value);
  }
  const close = closeBookIx(owner, b.slug);
  if (!close.ok) throw new Error(close.why);
  ixs.push(close.value);
  const conn = connection();
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: owner,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
        ...ixs,
      ],
    }).compileToV0Message(),
  );
  const before = await conn.getBalance(owner, "confirmed");
  const [bookInfo, handleInfo] = await conn.getMultipleAccountsInfo(
    [bookPda(owner), handlePda(b.slug)],
    "confirmed",
  );
  const sim = await conn.simulateTransaction(tx, {
    sigVerify: false,
    replaceRecentBlockhash: true,
    commitment: "confirmed",
    accounts: { encoding: "base64", addresses: [owner.toBase58()] },
  });
  if (sim.value.err) {
    console.log("FAILED", JSON.stringify(sim.value.err));
    console.log((sim.value.logs ?? []).slice(-8).join("\n"));
    return;
  }
  const after = sim.value.accounts?.[0]?.lamports ?? 0;
  console.log(
    `${ixs.length} instructions (${d.delegatedAmount > 0n ? "revoke, " : ""}${b.rule.enabled ? "turn off, " : ""}close), ${tx.serialize().length} bytes, simulation ok`,
  );
  console.log(
    `the savings record holds ${(bookInfo?.lamports ?? 0) / 1e9} SOL and its name ${(handleInfo?.lamports ?? 0) / 1e9} SOL`,
  );
  console.log(
    `the wallet goes from ${before / 1e9} to ${after / 1e9} SOL: +${(after - before) / 1e9} after the fee`,
  );
}
main().catch((err) => {
  console.error(err instanceof Error ? err.message.replace(/https?:\/\/\S+/g, "<rpc>") : err);
  process.exit(1);
});

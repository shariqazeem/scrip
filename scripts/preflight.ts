/**
 * AM I READY FOR MAINNET? Every answer is read from the chain, the build and the environment
 * at the moment you ask. Nothing here signs, sends or spends; it only looks, and it prints a
 * line per check saying what is true and, where something is missing, exactly what to do.
 *
 *     npx tsx scripts/preflight.ts                 # against whatever .env.local names
 *     npx tsx scripts/preflight.ts --mainnet       # against mainnet, whatever .env.local says
 *
 * A FAIL is a thing that would make the deploy or the first sweep fail. A WAIT is a thing the
 * founder has to fund or fetch. A NOTE is a fact worth reading before signing anything.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getAccount, getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { ASSETS, USDC_MINT, assetBySymbol } from "@/lib/assets/registry";
import { makeConnection } from "@/lib/solana/make-connection";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";
import { usdcAta } from "@/lib/rule/instructions";

for (const line of existsSync(join(process.cwd(), ".env.local")) ? readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n") : []) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

const MAINNET = process.argv.includes("--mainnet");
const RPC = MAINNET
  ? process.env.SOLANA_MAINNET_RPC?.trim() || process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com"
  : process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() || "https://api.devnet.solana.com";
const conn = makeConnection(RPC);

let fails = 0;
let waits = 0;
function ok(what: string, detail: string) {
  console.log(`  ok    ${what.padEnd(26)} ${detail}`);
}
function wait(what: string, detail: string) {
  waits += 1;
  console.log(`  WAIT  ${what.padEnd(26)} ${detail}`);
}
function fail(what: string, detail: string) {
  fails += 1;
  console.log(`  FAIL  ${what.padEnd(26)} ${detail}`);
}
function note(what: string, detail: string) {
  console.log(`  note  ${what.padEnd(26)} ${detail}`);
}

function keypairAt(path: string | undefined): Keypair | null {
  if (!path || !existsSync(path)) return null;
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8")) as number[]));
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\nScrip preflight — ${MAINNET ? "mainnet" : "the cluster .env.local names"} — ${RPC.replace(/\?api-key=.*/, "?api-key=…")}\n`);

  // ── the build that would be deployed ───────────────────────────────────────────────
  console.log("The program");
  const so = join(process.cwd(), "anchor", "target", "deploy", MAINNET ? "scrip-mainnet.so" : "scrip-devnet.so");
  if (!existsSync(so)) fail("the build", `${so} is missing. Run ${MAINNET ? "npm run anchor:build" : "npm run anchor:build:devnet"}.`);
  else {
    const bytes = readFileSync(so);
    const rent = await conn.getMinimumBalanceForRentExemption(bytes.length);
    ok("the build", `${bytes.length.toLocaleString("en-US")} bytes, sha256 ${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}…`);
    note("rent for it", `${(rent / LAMPORTS_PER_SOL).toFixed(4)} SOL, held as a deposit and returned in full by \`solana program close\``);
    const info = await conn.getAccountInfo(SCRIP_PROGRAM_ID, "confirmed");
    if (!info) note("deployed here", `not yet — ${SCRIP_PROGRAM_ID.toBase58()} does not exist on this cluster`);
    else {
      const [programData] = PublicKey.findProgramAddressSync([SCRIP_PROGRAM_ID.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));
      const data = await conn.getAccountInfo(programData, "confirmed");
      const allocated = data ? data.data.length - 45 : 0;
      ok("deployed here", `${SCRIP_PROGRAM_ID.toBase58()}, ${allocated.toLocaleString("en-US")} bytes allocated`);
      if (allocated < bytes.length) fail("room to upgrade", `the deployed allocation is smaller than the build; extend it by ${bytes.length - allocated} bytes first`);
      const authority = data && data.data[12] === 1 ? new PublicKey(data.data.subarray(13, 45)).toBase58() : null;
      note("upgrade authority", authority ?? "none: the program is frozen");
    }
  }

  // ── the keys that must exist and be funded ─────────────────────────────────────────
  console.log("\nThe keys");
  const deployer = keypairAt(join(process.cwd(), "anchor", ".keys", "deployer.json"));
  // The keeper falls back to the deployer, which is how the devnet deployment runs today.
  const keeper = keypairAt(process.env.SCRIP_KEEPER_KEYPAIR) ?? deployer;
  const front = keypairAt(join(process.cwd(), "anchor", ".keys", "front.json"));

  // What the deployer must hold, exactly. Measured on devnet on 2026-09-19 by funding a
  // throwaway payer with 2.9794 SOL and deploying the real 585,384-byte mainnet build:
  // it landed and left 0.00102232 SOL, so the whole deploy cost 2.97837768 SOL.
  //
  // The buffer is NOT a second 2.97 SOL. `DeployWithMaxDataLen` moves the buffer's
  // lamports into the programdata account, so peak requirement equals the total. An
  // upgrade is different: there the programdata is already funded, so the buffer's
  // lamports come back to the payer and only fees are spent.
  //
  // Allocate the exact size. Headroom is the same money paid now instead of at the
  // upgrade that needs it, and `solana program extend` buys it then, only if a later
  // build is bigger.
  const PROGRAM_HEADER = 45; // programdata's header, ahead of the ELF
  const PROGRAM_ACCOUNT = 36; // the program account itself
  // Base fees measured at 0.002915 SOL — 582 transactions, 583 signatures at 5,000
  // lamports. A priority price of 10,000 microlamports per compute unit added 0.000172.
  // This allows the base plus a priority price of roughly 180,000, far above a deploy's
  // need, and is the only part of the figure actually spent.
  const DEPLOY_FEES = 0.006 * LAMPORTS_PER_SOL;
  let need = 0;
  let plan = "";
  if (existsSync(so)) {
    const size = readFileSync(so).length;
    const maxLen = size;
    const deployed = await conn.getAccountInfo(SCRIP_PROGRAM_ID, "confirmed");
    if (deployed) {
      const buffer = await conn.getMinimumBalanceForRentExemption(size);
      need = buffer + DEPLOY_FEES;
      plan = `an upgrade: a buffer of ${(buffer / LAMPORTS_PER_SOL).toFixed(4)} SOL, returned to the payer when it lands, plus about ${(DEPLOY_FEES / LAMPORTS_PER_SOL).toFixed(3)} SOL of fees, which is all it really costs`;
    } else {
      const allocation = await conn.getMinimumBalanceForRentExemption(maxLen + PROGRAM_HEADER);
      const account = await conn.getMinimumBalanceForRentExemption(PROGRAM_ACCOUNT);
      need = allocation + account + DEPLOY_FEES;
      plan = `a first deploy at --max-len ${maxLen.toLocaleString("en-US")}: ${(allocation / LAMPORTS_PER_SOL).toFixed(6)} SOL of rent on the programdata and ${(account / LAMPORTS_PER_SOL).toFixed(6)} on the program account, both a deposit that \`solana program close\` returns in full, plus fees. Fund ${(need / LAMPORTS_PER_SOL).toFixed(4)} SOL; the buffer is not a second allocation, because its lamports become the programdata's`;
    }
    note("the deploy costs", plan);
  } else {
    need = 3 * LAMPORTS_PER_SOL;
  }
  // Measured on devnet on 2026-09-19, at the post-SIMD-0437 rate of 5,080 lamports a byte.
  // A sweep costs the register's float KEEPER_TIP (500,000) plus the receipt's rent
  // (2,519,680 for 368 bytes), so 0.00302 SOL a sweep — and the receipt keeps its rent,
  // because a receipt is permanent. The keeper is repaid both and ends each sweep about
  // 489,000 lamports ahead, so its balance is a buffer to front the first one, not a budget.
  const SWEEP_COST = 3_020_000;
  const SWEEPS = 30;
  const keeperNeed = 0.05 * LAMPORTS_PER_SOL;
  const frontNeed = 2_459_000 + 864_000 + 2_100_000 + SWEEPS * SWEEP_COST;
  for (const [what, key, want, why] of [
    ["deployer", deployer, need, "the deploy above"],
    ["keeper", keeper, keeperNeed, "fronting one Pyth post and one receipt; every sweep repays it with 0.0005 SOL over"],
    ["front wallet", front, frontNeed, `the register and handle rent, the asset account, and float for ${SWEEPS} sweeps at ${(SWEEP_COST / LAMPORTS_PER_SOL).toFixed(5)} SOL each`],
  ] as const) {
    if (!key) {
      wait(what, "no key file; generate one and keep it out of the repository");
      continue;
    }
    const lamports = await conn.getBalance(key.publicKey, "confirmed");
    const line = `${key.publicKey.toBase58()} — ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`;
    if (lamports >= want) ok(what, line);
    else wait(what, `${line}; needs about ${(want / LAMPORTS_PER_SOL).toFixed(2)} SOL for ${why}`);
  }

  // ── the mints and feeds the program compiles in ────────────────────────────────────
  console.log("\nThe registry, read from this cluster");
  if (!MAINNET) note("the registry", "the devnet build accepts any mint, so these are not checked there");
  else {
    const usdc = await conn.getAccountInfo(new PublicKey(USDC_MINT), "confirmed");
    if (!usdc) fail("USDC", `${USDC_MINT} is not a mint on this cluster`);
    else ok("USDC", `${USDC_MINT}, ${(await getMint(conn, new PublicKey(USDC_MINT))).decimals} decimals`);
    for (const a of ASSETS.filter((x) => x.symbol !== "USDC").slice(0, 3)) {
      const info = await conn.getAccountInfo(new PublicKey(a.mint), "confirmed");
      if (!info) fail(a.symbol, `${a.mint} is not a mint on this cluster`);
      else ok(a.symbol, `${a.mint.slice(0, 8)}…, ${info.owner.equals(TOKEN_PROGRAM_ID) ? "spl-token" : "token-2022"}`);
    }
    const spy = assetBySymbol("SPYx");
    for (const feed of [spy?.feedRaw, spy?.feedAdjusted]) {
      if (!feed?.account) continue;
      const info = await conn.getAccountInfo(new PublicKey(feed.account), "confirmed");
      if (!info) wait("a pinned Pyth account", `${feed.account.slice(0, 8)}… is not on this cluster; the keeper posts its own update, so this is a convenience`);
      else ok("Pyth account", `${feed.account.slice(0, 8)}… exists, ${info.data.length} bytes`);
    }
  }

  // ── what the keeper needs beyond SOL ───────────────────────────────────────────────
  console.log("\nThe keeper's world");
  if (MAINNET && !process.env.PYTH_API_KEY?.trim()) wait("PYTH_API_KEY", "Hermes has required one since 2026-08-26; without it the keeper cannot refresh a stale price");
  else if (MAINNET) ok("PYTH_API_KEY", "set");
  const rpcIsPublic = /api\.(mainnet-beta|devnet)\.solana\.com/.test(RPC);
  if (rpcIsPublic) wait("the RPC", "this is Solana's public endpoint: it refuses bursts and blocks getTransaction for long stretches. Set NEXT_PUBLIC_SOLANA_RPC to a paid endpoint");
  else ok("the RPC", "not a public endpoint");
  if (keeper) {
    const ata = usdcAta(keeper.publicKey, new PublicKey(MAINNET ? USDC_MINT : process.env.NEXT_PUBLIC_DEVNET_USDC_MINT || USDC_MINT));
    const acct = await getAccount(conn, ata, "confirmed", TOKEN_PROGRAM_ID).catch(() => null);
    if (acct) ok("keeper's USDC account", `${ata.toBase58().slice(0, 8)}… exists; the slice passes through it`);
    else wait("keeper's USDC account", `${ata.toBase58().slice(0, 8)}… does not exist yet. Send it any USDC once, or let the first sweep create it`);
  }

  console.log(`\n${fails === 0 ? "Nothing would fail." : `${fails} thing${fails === 1 ? "" : "s"} would fail.`} ${waits === 0 ? "Nothing is waiting." : `${waits} thing${waits === 1 ? "" : "s"} waiting on the founder.`}\n`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

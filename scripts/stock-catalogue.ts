/**
 * THE STOCK CATALOGUE — every tokenized stock a save can buy, read on one day and checked in.
 *
 *     npx tsx --env-file=.env.local scripts/stock-catalogue.ts
 *
 * Save now buys any stock Jupiter can route, but "any" is not a list a person can trust, so
 * the catalogue is curated by rules rather than by hand:
 *
 *   1. Jupiter's verified token list, tagged `stocks` and by one of the three issuers whose
 *      documents Scrip has read: xStocks (Backed), Ondo Global Markets, Backpack Securities.
 *   2. The mint read off mainnet. A mint whose transfers are restricted is left out: an
 *      active transfer hook, accounts frozen by default, a non-transferable mint, or a
 *      transfer fee. Each of those can strand a saver's stock or shave it on every move.
 *   3. A real route at $5 and at $100 from USDC, through the same quote endpoint a save uses,
 *      with the same account limit. A stock that cannot be bought at $5 is not offered.
 *
 * The output is `src/lib/assets/catalogue.json`, with the date it was read. A test holds the
 * eleven registry mints and the catalogue to each other, so the two lists cannot drift.
 */
import { writeFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  AccountState,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getDefaultAccountState,
  getNonTransferable,
  getPausableConfig,
  getPermanentDelegate,
  getScaledUiAmountConfig,
  getTransferFeeConfig,
  getTransferHook,
  unpackMint,
} from "@solana/spl-token";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JUP = process.env.JUPITER_API_URL?.replace(/\/+$/, "") || "https://lite-api.jup.ag";
const RPC = process.env.SOLANA_MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com";
const OUT = new URL("../src/lib/assets/catalogue.json", import.meta.url);
/** The same account limit a save's quote uses (`src/lib/save/build.ts`). */
const MAX_ACCOUNTS = 30;
const MAX_IMPACT_PCT = 1;

type Issuer = "xstocks" | "ondo" | "backpack";
type JupToken = {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
  tags?: string[];
  liquidity?: number;
  holderCount?: number;
  tokenProgram?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function issuerOf(t: JupToken): Issuer | null {
  const tags = t.tags ?? [];
  if (!tags.includes("stocks")) return null;
  if (tags.includes("xstocks")) return "xstocks";
  if (tags.includes("ondo")) return "ondo";
  if (tags.includes("backpack")) return "backpack";
  return null;
}

/** Names as a person says them. The issuer's suffix goes; the company stays. */
const NAMES: Record<string, string> = {
  SPYx: "S&P 500",
  QQQx: "Nasdaq 100",
  NVDAx: "Nvidia",
  NVDAon: "Nvidia",
  GLDx: "Gold ETF",
  SPYon: "S&P 500 ETF (SPDR)",
  QQQon: "Nasdaq 100 (Invesco QQQ)",
  MSTRx: "Strategy",
  STRCx: "Strategy preferred (STRC)",
};

function companyName(t: JupToken, issuer: Issuer): string {
  if (NAMES[t.symbol]) return NAMES[t.symbol]!;
  let n = t.name;
  if (issuer === "xstocks") n = n.replace(/\s*xStock$/i, "");
  if (issuer === "backpack") n = n.replace(/\s*-\s*Backpack Securities$/i, "");
  if (issuer === "ondo") n = n.replace(/\s*\(Ondo Tokenized\)\.?$/i, "").replace(/\s*Ondo Tokenized\.?$/i, "");
  n = n.replace(/\s+Common Stock$/i, "").replace(/\s+(Inc\.?|Corp\.?|Corporation)$/i, "").trim();
  return n;
}

function tickerOf(symbol: string, issuer: Issuer): string {
  if (issuer === "xstocks") return symbol.replace(/x$/, "");
  if (issuer === "ondo") return symbol.replace(/on$/, "");
  return symbol;
}

async function quote(mint: string, usd: number): Promise<{ impactPct: number; labels: string[]; outRaw: string } | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const p = new URLSearchParams({
      inputMint: USDC,
      outputMint: mint,
      amount: String(Math.round(usd * 1e6)),
      slippageBps: "100",
      swapMode: "ExactIn",
      restrictIntermediateTokens: "true",
      maxAccounts: String(MAX_ACCOUNTS),
    });
    const res = await fetch(`${JUP}/swap/v1/quote?${p}`, { headers: { accept: "application/json" } }).catch(() => null);
    if (res?.status === 429) {
      await sleep(3_000 * (attempt + 1));
      continue;
    }
    if (!res || !res.ok) return null;
    const j = (await res.json()) as { outAmount?: string; priceImpactPct?: string; routePlan?: Array<{ swapInfo: { label?: string } }> };
    if (!j.outAmount || BigInt(j.outAmount) <= 0n) return null;
    return {
      impactPct: Number(j.priceImpactPct ?? "0") * 100,
      labels: [...new Set((j.routePlan ?? []).map((r) => r.swapInfo.label ?? "?"))],
      outRaw: j.outAmount,
    };
  }
  return null;
}

async function main() {
  const at = new Date().toISOString().slice(0, 10);
  console.log(`reading Jupiter's verified list…`);
  const list = (await (await fetch(`${JUP}/tokens/v2/tag?query=verified`)).json()) as JupToken[];
  const stocks = list
    .map((t) => ({ t, issuer: issuerOf(t) }))
    .filter((x): x is { t: JupToken; issuer: Issuer } => x.issuer !== null)
    // Worth a quote: a pool with some depth, or an order book with real holders behind it.
    .filter(({ t }) => (t.liquidity ?? 0) >= 10_000 || (t.holderCount ?? 0) >= 150);
  console.log(`${stocks.length} candidates`);

  const conn = new Connection(RPC, "confirmed");
  const mints = stocks.map(({ t }) => new PublicKey(t.id));
  const infos: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>> = [];
  for (let i = 0; i < mints.length; i += 100) infos.push(...(await conn.getMultipleAccountsInfo(mints.slice(i, i + 100), "confirmed")));

  const kept: unknown[] = [];
  const left: Array<{ symbol: string; mint: string; why: string }> = [];
  for (let i = 0; i < stocks.length; i += 1) {
    const { t, issuer } = stocks[i]!;
    const info = infos[i];
    if (!info) {
      left.push({ symbol: t.symbol, mint: t.id, why: "mint not found" });
      continue;
    }
    const is22 = info.owner.equals(TOKEN_2022_PROGRAM_ID);
    if (!is22 && !info.owner.equals(TOKEN_PROGRAM_ID)) {
      left.push({ symbol: t.symbol, mint: t.id, why: "not a token mint" });
      continue;
    }
    const mint = unpackMint(new PublicKey(t.id), info, info.owner);
    const hook = is22 ? getTransferHook(mint) : null;
    const hookState = !hook ? "none" : hook.programId.equals(PublicKey.default) ? "reserved-disabled" : "active";
    const das = is22 ? getDefaultAccountState(mint) : null;
    const fee = is22 ? getTransferFeeConfig(mint) : null;
    const feeBps = fee ? Math.max(fee.olderTransferFee.transferFeeBasisPoints, fee.newerTransferFee.transferFeeBasisPoints) : 0;
    const powers = {
      permanentDelegate: is22 && getPermanentDelegate(mint) !== null,
      pausable: is22 && getPausableConfig(mint) !== null,
      freezeAuthority: mint.freezeAuthority !== null,
      transferHook: hookState,
      transferFee: feeBps > 0,
      hasMultiplier: is22 && getScaledUiAmountConfig(mint) !== null,
      frozenByDefault: das?.state === AccountState.Frozen,
      nonTransferable: is22 && getNonTransferable(mint) !== null,
    };
    const restricted =
      powers.transferHook === "active"
        ? "an active transfer hook"
        : powers.frozenByDefault
          ? "new accounts are frozen until the issuer thaws them"
          : powers.nonTransferable
            ? "non-transferable"
            : powers.transferFee
              ? `a ${feeBps / 100}% transfer fee`
              : null;
    if (restricted) {
      left.push({ symbol: t.symbol, mint: t.id, why: restricted });
      continue;
    }
    const at5 = await quote(t.id, 5);
    await sleep(1_100);
    if (!at5 || at5.impactPct > MAX_IMPACT_PCT) {
      left.push({ symbol: t.symbol, mint: t.id, why: at5 ? `moves the price ${at5.impactPct.toFixed(2)}% at $5` : "no route at $5" });
      continue;
    }
    const at100 = await quote(t.id, 100);
    await sleep(1_100);
    kept.push({
      mint: t.id,
      symbol: t.symbol,
      ticker: tickerOf(t.symbol, issuer),
      name: companyName(t, issuer),
      issuer,
      decimals: mint.decimals,
      program: is22 ? "token-2022" : "spl-token",
      powers,
      icon: t.icon ?? "",
      liquidityUsd: Math.round(t.liquidity ?? 0),
      holders: t.holderCount ?? 0,
      route5: { impactPct: Number(at5.impactPct.toFixed(4)), via: at5.labels },
      route100: at100 ? { impactPct: Number(at100.impactPct.toFixed(4)), via: at100.labels } : null,
    });
    console.log(`kept ${t.symbol.padEnd(10)} ${issuer.padEnd(9)} $5 ${at5.impactPct.toFixed(3)}%  $100 ${at100 ? `${at100.impactPct.toFixed(3)}%` : "no route"}`);
  }
  writeFileSync(OUT, `${JSON.stringify({ readAt: at, source: "Jupiter verified list, mint accounts on mainnet, Jupiter quotes at $5 and $100", stocks: kept, left }, null, 2)}\n`);
  console.log(`\nkept ${kept.length}, left out ${left.length}`);
  for (const l of left.filter((x) => !/no route|moves the price/.test(x.why))) console.log(`  left ${l.symbol}: ${l.why}`);
}

void main();

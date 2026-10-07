/**
 * @vitest-environment node
 */
import { sha256 } from "@noble/hashes/sha256";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { USDC_MINT, offeredAssets } from "@/lib/assets/registry";
import { MEMO_PROGRAM_ID } from "@/lib/intake/memo";
import { fromBase58, toBase58 } from "@/lib/solana/base58";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";
import type { TxView } from "@/lib/solana/tx-view";
import { MIN_SAVE_USDC, fillableChips, parseSaveUsd, suggestSave } from "./amount";
import { inflowFrom, mintDeltas } from "./balances";
import { openWithMark } from "./build";
import { FEATURED_SYMBOLS, catalogue, defaultStock, disclosure, featured, powersSentence, stockByMint } from "./catalogue";
import { SAVE_MARK, SAVE_MEMO } from "./mark";
import { JUPITER_PROGRAM_ID, hopsOf, parseSave } from "./parse";

const NOW = 1_791_300_000;
const OWNER = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const PAYER = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const NVDAX = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";

const bal = (accountIndex: number, mint: string, owner: string, amount: bigint | number, decimals = 6) => ({
  accountIndex,
  mint,
  owner,
  uiTokenAmount: { amount: String(amount), decimals },
});

function view(over: Partial<TxView>): TxView {
  return {
    sig: "sig",
    slot: 1,
    blockTime: NOW,
    err: null,
    fee: 5_000,
    keys: [OWNER],
    signers: [OWNER],
    preBalances: [],
    postBalances: [],
    preTokenBalances: [],
    postTokenBalances: [],
    instructions: [],
    inner: [],
    ...over,
  };
}

describe("the first line: what a paid wallet is offered", () => {
  const paid = (at: number, usd: number) => ({ sig: `s${at}`, at, usdc: BigInt(Math.round(usd * 1e6)), from: PAYER });

  it("offers 10% of the latest payment, to the cent, when the wallet can spend it", () => {
    const s = suggestSave([paid(NOW - 86_400, 137.43), paid(NOW - 3 * 86_400, 500)], 200_000_000n, NOW);
    expect(s?.inflow.at).toBe(NOW - 86_400);
    expect(s?.saveUsdc).toBe(13_740_000n);
  });

  it("never offers a slice the wallet cannot fill: the chips instead", () => {
    expect(suggestSave([paid(NOW - 86_400, 250)], 12_000_000n, NOW)).toBeNull();
  });

  it("skips a payment whose slice is under the smallest save, and anything older than a month", () => {
    expect(suggestSave([paid(NOW - 60, 7)], 100_000_000n, NOW)).toBeNull();
    expect(suggestSave([paid(NOW - 31 * 86_400, 900)], 1_000_000_000n, NOW)).toBeNull();
    const s = suggestSave([paid(NOW - 60, 7), paid(NOW - 120, 50)], 100_000_000n, NOW);
    expect(s?.saveUsdc).toBe(5_000_000n);
  });

  it("filters the chips to what a connected wallet holds, and offers them all before", () => {
    expect(fillableChips(null)).toEqual([5, 10, 25]);
    expect(fillableChips(12_000_000n)).toEqual([5, 10]);
    expect(fillableChips(0n)).toEqual([]);
  });

  it("reads dollars typed by a person, and refuses what cannot be saved", () => {
    expect(parseSaveUsd("$12.50")).toEqual({ ok: true, usdc: 12_500_000n });
    expect(parseSaveUsd(5)).toEqual({ ok: true, usdc: 5_000_000n });
    expect(parseSaveUsd("0.5").ok).toBe(false);
    expect(parseSaveUsd("ten").ok).toBe(false);
    expect(MIN_SAVE_USDC).toBe(1_000_000n);
  });
});

describe("a payment is USDC in that the wallet did not sign for", () => {
  it("names the sender as the other owner whose USDC fell the most", () => {
    const tx = view({
      keys: [PAYER, OWNER],
      signers: [PAYER],
      preTokenBalances: [bal(1, USDC_MINT, PAYER, 900_000_000), bal(2, USDC_MINT, OWNER, 10_000_000)],
      postTokenBalances: [bal(1, USDC_MINT, PAYER, 650_000_000), bal(2, USDC_MINT, OWNER, 260_000_000)],
    });
    expect(mintDeltas(tx, USDC_MINT).get(OWNER)).toBe(250_000_000n);
    expect(inflowFrom(tx, OWNER)).toEqual({ sig: "sig", at: NOW, usdc: 250_000_000n, from: PAYER });
  });

  it("is not a payment when the owner signed it: a swap, or money moved between their own accounts", () => {
    const tx = view({
      keys: [OWNER],
      signers: [OWNER],
      preTokenBalances: [bal(2, USDC_MINT, OWNER, 0)],
      postTokenBalances: [bal(2, USDC_MINT, OWNER, 50_000_000)],
    });
    expect(inflowFrom(tx, OWNER)).toBeNull();
  });

  it("is not a payment when it failed, or when the owner's USDC fell", () => {
    expect(inflowFrom(view({ err: { InstructionError: [0, "x"] }, keys: [PAYER], signers: [PAYER] }), OWNER)).toBeNull();
    const out = view({ keys: [PAYER, OWNER], signers: [PAYER], preTokenBalances: [bal(2, USDC_MINT, OWNER, 9)], postTokenBalances: [bal(2, USDC_MINT, OWNER, 1)] });
    expect(inflowFrom(out, OWNER)).toBeNull();
  });
});

/** Jupiter's SwapEvent as it sits in an inner instruction: tag, discriminator, five fields. */
function swapEvent(amm: string, inMint: string, inAmount: bigint, outMint: string, outAmount: bigint): Uint8Array {
  const b = new Uint8Array(128);
  b.set([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d], 0);
  b.set(sha256(new TextEncoder().encode("event:SwapEvent")).slice(0, 8), 8);
  const u64 = (v: bigint, at: number) => {
    for (let i = 0; i < 8; i += 1) b[at + i] = Number((v >> BigInt(8 * i)) & 0xffn);
  };
  b.set(new PublicKey(amm).toBytes(), 16);
  b.set(new PublicKey(inMint).toBytes(), 48);
  u64(inAmount, 80);
  b.set(new PublicKey(outMint).toBytes(), 88);
  u64(outAmount, 120);
  return b;
}

describe("a save, read from its transaction alone", () => {
  const WHIRLPOOL = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
  const saveTx = (over: Partial<TxView> = {}) =>
    view({
      keys: [OWNER, "UsdcAta1111111111111111111111111111111111111", "StockAta111111111111111111111111111111111111", SAVE_MARK.toBase58()],
      signers: [OWNER],
      preBalances: [50_000_000, 2_039_280, 0, 0],
      postBalances: [46_900_000, 2_039_280, 3_078_480, 0],
      preTokenBalances: [bal(1, USDC_MINT, OWNER, 20_000_000)],
      postTokenBalances: [bal(1, USDC_MINT, OWNER, 15_000_000), bal(2, NVDAX, OWNER, 2_083_456, 8)],
      instructions: [{ programId: MEMO_PROGRAM_ID, accounts: [OWNER], data: null, parsed: SAVE_MEMO }],
      inner: [{ programId: JUPITER_PROGRAM_ID, accounts: [], data: swapEvent(WHIRLPOOL, USDC_MINT, 5_000_000n, NVDAX, 2_083_456n), parsed: null }],
      ...over,
    });

  it("is the fee payer's USDC fall and the stock that rose in an account they own", () => {
    const s = parseSave(saveTx());
    expect(s).not.toBeNull();
    expect(s!.owner).toBe(OWNER);
    expect(s!.paidUsdc).toBe(5_000_000n);
    expect(s!.mint).toBe(NVDAX);
    expect(s!.amountRaw).toBe(2_083_456n);
    expect(s!.decimals).toBe(8);
    expect(s!.marked).toBe(true);
    expect(s!.depositLamports).toBe(3_078_480);
    expect(s!.feeLamports).toBe(5_000);
  });

  it("reads the route from Jupiter's swap events", () => {
    const hops = hopsOf(saveTx());
    expect(hops).toEqual([{ amm: WHIRLPOOL, inMint: USDC_MINT, inAmount: 5_000_000n, outMint: NVDAX, outAmount: 2_083_456n }]);
  });

  it("is not a save without the memo, with another memo, or when it failed", () => {
    expect(parseSave(saveTx({ instructions: [] }))).toBeNull();
    expect(parseSave(saveTx({ instructions: [{ programId: MEMO_PROGRAM_ID, accounts: [OWNER], data: null, parsed: "scrip:save:v2" }] }))).toBeNull();
    expect(parseSave(saveTx({ err: { InstructionError: [3, { Custom: 6001 }] } }))).toBeNull();
  });

  it("reads a memo the RPC left as bytes, and says when the mark is missing", () => {
    const s = parseSave(saveTx({ instructions: [{ programId: MEMO_PROGRAM_ID, accounts: [OWNER], data: new TextEncoder().encode(SAVE_MEMO), parsed: null }], keys: [OWNER, "a", "b"] }));
    expect(s?.marked).toBe(false);
  });

  it("does not count an existing stock account's balance as a deposit", () => {
    const s = parseSave(saveTx({ preBalances: [50_000_000, 2_039_280, 3_078_480, 0], postBalances: [49_990_000, 2_039_280, 3_078_480, 0] }));
    expect(s?.depositLamports).toBe(0);
  });
});

describe("the mark and the memo", () => {
  it("is Scrip's program address for the seed \"save\", and the memo is versioned", () => {
    expect(SAVE_MARK.toBase58()).toBe(PublicKey.findProgramAddressSync([Buffer.from("save")], SCRIP_PROGRAM_ID)[0].toBase58());
    expect(SAVE_MARK.toBase58()).toBe("5xh4j7jt3ytCksSbiZXbuFowmqaPZGfMPcrM2mx4Ebkd");
    expect(PublicKey.isOnCurve(SAVE_MARK.toBytes())).toBe(false);
    expect(SAVE_MEMO).toBe("scrip:save:v1");
  });

  it("rides read-only, after the six accounts the associated-token program reads", () => {
    const ix = openWithMark(new PublicKey(OWNER), defaultStock());
    expect(ix.keys).toHaveLength(7);
    expect(ix.keys[6]).toEqual({ pubkey: SAVE_MARK, isSigner: false, isWritable: false });
    expect(ix.data.toString("hex")).toBe("01");
  });
});

describe("the catalogue and the registry agree", () => {
  it("carries every asset a rule can save into, marked as saving automatically", () => {
    for (const a of offeredAssets()) {
      const s = stockByMint(a.mint);
      expect(s, a.symbol).toBeTruthy();
      expect(s!.auto, a.symbol).toBe(true);
      expect(s!.decimals, a.symbol).toBe(a.decimals);
      expect(s!.program, a.symbol).toBe(a.program);
    }
    expect(catalogue().filter((s) => s.auto)).toHaveLength(offeredAssets().length);
  });

  it("has the six a person sees first, S&P 500 by default, and no mint twice", () => {
    expect(featured().map((s) => s.symbol)).toEqual([...FEATURED_SYMBOLS]);
    expect(defaultStock().name).toBe("S&P 500");
    const mints = catalogue().map((s) => s.mint);
    expect(new Set(mints).size).toBe(mints.length);
  });

  it("discloses every stock per issuer and per mint, never with an empty line", () => {
    for (const s of catalogue()) {
      const d = disclosure(s);
      expect(d.length, s.symbol).toBeGreaterThan(80);
      if (s.issuer.key !== "oro") expect(d, s.symbol).toMatch(/US persons|United States/);
    }
    expect(powersSentence({ permanentDelegate: true, pausable: true, freezeAuthority: true, hasMultiplier: true })).toBe(
      "The issuer can move or burn, freeze or pause this token, so self-custody here means not Scrip's custody.",
    );
    expect(powersSentence({ permanentDelegate: false, pausable: false, freezeAuthority: false, hasMultiplier: false })).toMatch(/no power/);
  });
});

describe("base58, both ways", () => {
  it("round-trips bytes, leading zeroes included", () => {
    const b = Uint8Array.from([0, 0, 1, 2, 255, 128, 7]);
    expect(fromBase58(toBase58(b))).toEqual(b);
    expect(toBase58(new PublicKey(NVDAX).toBytes())).toBe(NVDAX);
    expect(fromBase58("0OIl")).toBeNull();
  });
});

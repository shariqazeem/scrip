// @vitest-environment node
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { USDC_MINT } from "@/lib/assets/registry";
import { usdcAta } from "@/lib/rule/instructions";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";
import { START_MEMO } from "@/lib/start/instructions";
import { attributeSweep, isStartLog, startedWith } from "./attribute";

const owner = Keypair.generate().publicKey;
const payer = Keypair.generate().publicKey;
const ownerAta = usdcAta(owner, new PublicKey(USDC_MINT));
const payerAta = usdcAta(payer, new PublicKey(USDC_MINT));
const MEMO_LOG = `Program log: Memo (len ${START_MEMO.length}): "${START_MEMO}"`;
const SCRIP_LOG = `Program ${SCRIP_PROGRAM_ID.toBase58()} invoke [1]`;

type Fake = { sig: string; slot: number; at: number; logs: string[]; ownerDelta: bigint; fromPayer?: boolean };

/** A connection that answers with these transactions, newest first, the way the RPC does. */
function conn(txs: Fake[]) {
  const bal = (n: bigint) => ({ amount: n.toString() });
  return {
    getSignaturesForAddress: async () => txs.map((t) => ({ signature: t.sig, slot: t.slot, blockTime: t.at, err: null })),
    getTransactions: async (sigs: string[]) =>
      sigs.map((sig) => {
        const t = txs.find((x) => x.sig === sig)!;
        const keys = [ownerAta, payerAta];
        return {
          meta: {
            logMessages: t.logs,
            loadedAddresses: undefined,
            preTokenBalances: [
              { accountIndex: 0, mint: USDC_MINT, owner: owner.toBase58(), uiTokenAmount: bal(100_000_000n) },
              { accountIndex: 1, mint: USDC_MINT, owner: payer.toBase58(), uiTokenAmount: bal(500_000_000n) },
            ],
            postTokenBalances: [
              { accountIndex: 0, mint: USDC_MINT, owner: owner.toBase58(), uiTokenAmount: bal(100_000_000n + t.ownerDelta) },
              { accountIndex: 1, mint: USDC_MINT, owner: payer.toBase58(), uiTokenAmount: bal(t.fromPayer ? 500_000_000n - t.ownerDelta : 500_000_000n) },
            ],
          },
          transaction: { message: { getAccountKeys: () => ({ length: keys.length, get: (i: number) => keys[i] }) } },
        };
      }),
  } as never;
}

describe("who a save's money came from", () => {
  it("names the start itself when the rule counted the last payment as it turned on", async () => {
    const r = await attributeSweep(
      conn([
        { sig: "sweep", slot: 100, at: 1_014, logs: [SCRIP_LOG], ownerDelta: -1_010_000n },
        { sig: "start", slot: 90, at: 1_000, logs: [MEMO_LOG, SCRIP_LOG], ownerDelta: 0n },
        { sig: "paid", slot: 50, at: 500, logs: [], ownerDelta: 10_100_000n, fromPayer: true },
      ]),
      owner.toBase58(),
      100n,
      10_100_000n,
    );
    expect(r.ok && r.value).toEqual([{ from: owner.toBase58(), usdc: "10100000", sig: "start", at: 1_000, start: true }]);
  });

  it("counts payments that landed after the start first, then the start for the rest", async () => {
    const r = await attributeSweep(
      conn([
        { sig: "sweep", slot: 100, at: 1_200, logs: [SCRIP_LOG], ownerDelta: -3_010_000n },
        { sig: "paid", slot: 95, at: 1_100, logs: [], ownerDelta: 20_000_000n, fromPayer: true },
        { sig: "start", slot: 90, at: 1_000, logs: [MEMO_LOG], ownerDelta: 0n },
      ]),
      owner.toBase58(),
      100n,
      30_100_000n,
    );
    expect(r.ok && r.value.map((a) => [a.sig, a.usdc, a.start ?? false])).toEqual([
      ["paid", "20000000", false],
      ["start", "10100000", true],
    ]);
  });

  it("never gives a later save the start's payment, which an earlier save already took", async () => {
    const r = await attributeSweep(
      conn([
        { sig: "sweep2", slot: 200, at: 2_000, logs: [SCRIP_LOG], ownerDelta: -2_000_000n },
        { sig: "sweep1", slot: 100, at: 1_014, logs: [SCRIP_LOG], ownerDelta: -1_010_000n },
        { sig: "start", slot: 90, at: 1_000, logs: [MEMO_LOG], ownerDelta: 0n },
      ]),
      owner.toBase58(),
      200n,
      20_000_000n,
    );
    expect(r.ok && r.value).toEqual([]);
  });

  it("reads the memo the memo program logs, and the flag from a cached row", () => {
    expect(isStartLog([MEMO_LOG])).toBe(true);
    expect(isStartLog(['Program log: Memo (len 13): "scrip:save:v1"'])).toBe(false);
    expect(startedWith(JSON.stringify([{ from: "a", usdc: "1", sig: "s", start: true }]))).toBe(true);
    expect(startedWith("[]")).toBe(false);
    expect(startedWith("not json")).toBe(false);
  });
});

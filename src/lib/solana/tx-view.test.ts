import type { Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { readTxView, readTxViews, readTxViewsAll } from "./tx-view";

/** A parsed transaction as the RPC returns it, as small as the view accepts. */
const raw = (slot: number) => ({
  slot,
  blockTime: 1_790_000_000,
  meta: { err: null, fee: 5000, preBalances: [1], postBalances: [1], logMessages: [] },
  transaction: { signatures: ["x"], message: { accountKeys: [{ pubkey: "A", signer: true }], instructions: [] } },
});

/** A connection whose batch answers are scripted per signature, and which counts what it was asked. */
function fake(answer: (sig: string, ask: number) => { result?: unknown; error?: { message: string } }) {
  const asked: string[] = [];
  const conn = {
    _rpcBatchRequest: async (reqs: Array<{ args: unknown[] }>) =>
      reqs.map((r) => {
        const sig = r.args[0] as string;
        asked.push(sig);
        return answer(sig, asked.filter((s) => s === sig).length);
      }),
    _rpcRequest: async (_m: string, args: unknown[]) => {
      const sig = args[0] as string;
      asked.push(sig);
      return answer(sig, asked.filter((s) => s === sig).length);
    },
  } as unknown as Connection;
  return { conn, asked };
}

describe("reading transactions", () => {
  it("reads a confirmed transaction once, however often it is asked for", async () => {
    const { conn, asked } = fake(() => ({ result: raw(1) }));
    await readTxViews(conn, ["once-1", "once-2"]);
    await readTxViews(conn, ["once-1", "once-2"]);
    expect((await readTxView(conn, "once-1"))?.slot).toBe(1);
    expect(asked).toEqual(["once-1", "once-2"]);
  });

  it("asks again for a transaction the RPC did not know yet", async () => {
    const { conn, asked } = fake((_s, n) => (n === 1 ? { result: null } : { result: raw(2) }));
    expect(await readTxViews(conn, ["later-1"])).toEqual([null]);
    expect((await readTxViews(conn, ["later-1"]))[0]?.slot).toBe(2);
    expect(asked).toEqual(["later-1", "later-1"]);
  });

  it("gives a quick reader a hole where an entry was refused", async () => {
    const { conn } = fake((s) => (s === "quick-2" ? { error: { message: "Too many requests for a specific RPC call" } } : { result: raw(3) }));
    const views = await readTxViews(conn, ["quick-1", "quick-2"]);
    expect(views[0]?.slot).toBe(3);
    expect(views[1]).toBeNull();
  });

  it("makes a reader that needs all of them wait out a refusal, and never sum a hole", async () => {
    const once = fake((s, n) => (s === "all-2" && n === 1 ? { error: { message: "Too many requests for a specific RPC call" } } : { result: raw(4) }));
    const views = await readTxViewsAll(once.conn, ["all-1", "all-2"]);
    expect(views.map((v) => v?.slot)).toEqual([4, 4]);
    expect(once.asked.filter((s) => s === "all-2")).toHaveLength(2);

    const never = fake((s) => (s === "none-2" ? { error: { message: "Too many requests for a specific RPC call" } } : { result: raw(5) }));
    await expect(readTxViewsAll(never.conn, ["none-1", "none-2"])).rejects.toThrow(/1 of 2 transactions could not be read/);
  }, 20_000);
});

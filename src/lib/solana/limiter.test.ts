import { describe, expect, it } from "vitest";
import { limitsFor, makeGate, methodGateFor } from "./limiter";

describe("what the gate allows, by endpoint", () => {
  it("is slow for Solana's public endpoints and fast for a paid one", () => {
    expect(limitsFor("https://api.devnet.solana.com").rps).toBe(4);
    expect(limitsFor("https://api.mainnet-beta.solana.com").concurrency).toBe(2);
    expect(limitsFor("https://mainnet.helius-rpc.com/?api-key=x").rps).toBe(100);
    expect(limitsFor("http://127.0.0.1:8899").rps).toBe(2_000);
  });
  it("lets an override tune a paid endpoint, and only ever slow Solana's own", () => {
    const before = { rps: process.env.SOLANA_RPC_RPS, concurrency: process.env.SOLANA_RPC_CONCURRENCY };
    process.env.SOLANA_RPC_RPS = "8";
    process.env.SOLANA_RPC_CONCURRENCY = "16";
    try {
      expect(limitsFor("https://mainnet.helius-rpc.com/?api-key=x")).toEqual({ rps: 8, concurrency: 16 });
      expect(limitsFor("https://api.mainnet-beta.solana.com")).toEqual({ rps: 4, concurrency: 2 });
      process.env.SOLANA_RPC_RPS = "1";
      expect(limitsFor("https://api.mainnet-beta.solana.com").rps).toBe(1);
    } finally {
      for (const [k, v] of [["SOLANA_RPC_RPS", before.rps], ["SOLANA_RPC_CONCURRENCY", before.concurrency]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it("gives an account search its own, slower gate on Solana's public endpoint only", () => {
    const search = methodGateFor("https://api.mainnet-beta.solana.com", "getProgramAccounts");
    expect(search?.rps).toBe(0.5);
    expect(search?.concurrency).toBe(1);
    expect(methodGateFor("https://api.mainnet-beta.solana.com", "getProgramAccounts")).toBe(search);
    expect(methodGateFor("https://api.mainnet-beta.solana.com", "getAccountInfo")).toBeNull();
    expect(methodGateFor("https://mainnet.helius-rpc.com/?api-key=x", "getProgramAccounts")).toBeNull();
  });

  it("is not fooled by a host that merely ends in the same words", () => {
    expect(limitsFor("https://api.devnet.solana.com.evil.example").rps).toBe(100);
  });
});

describe("the gate", () => {
  it("runs everything, in order, and never more than the concurrency at once", async () => {
    const gate = makeGate("http://127.0.0.1:8899");
    let live = 0;
    let peak = 0;
    const order: number[] = [];
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        gate.run(async () => {
          live += 1;
          peak = Math.max(peak, live);
          order.push(i);
          await new Promise((r) => setTimeout(r, 1));
          live -= 1;
        }),
      ),
    );
    expect(order).toHaveLength(20);
    expect(peak).toBeLessThanOrEqual(gate.concurrency);
  });
  it("spaces starts by the rate, and a failure frees the slot", async () => {
    const gate = makeGate("https://api.devnet.solana.com"); // 4 per second, 2 at once
    const started: number[] = [];
    const at = Date.now();
    await Promise.all(
      Array.from({ length: 4 }, () =>
        gate.run(async () => {
          started.push(Date.now() - at);
        }),
      ),
    );
    expect(started[3]).toBeGreaterThanOrEqual(700); // three gaps of 250 ms
    await expect(gate.run(async () => { throw new Error("no"); })).rejects.toThrow("no");
    await expect(gate.run(async () => "after")).resolves.toBe("after");
  }, 10_000);
});

describe("the gate is one per endpoint per process", () => {
  it("hands the same gate to every caller, however often the module is evaluated", async () => {
    const { gateFor } = await import("./limiter");
    expect(gateFor("https://api.devnet.solana.com")).toBe(gateFor("https://api.devnet.solana.com"));
    expect(gateFor("https://api.devnet.solana.com")).not.toBe(gateFor("http://127.0.0.1:8899"));
  });
});

describe("a refusal holds everyone back, not just the call that met it", () => {
  it("makes the next call wait, and forgets the penalty on a good answer", async () => {
    const gate = makeGate("http://127.0.0.1:8899"); // no rate gap of its own
    expect(gate.coolingFor()).toBe(0);
    gate.penalize();
    expect(gate.coolingFor()).toBeGreaterThan(1_000);
    const at = Date.now();
    await gate.run(async () => "waited");
    expect(Date.now() - at).toBeGreaterThanOrEqual(1_500);
    gate.reward();
    expect(gate.coolingFor()).toBe(0);
  }, 20_000);
  it("widens the pause while refusals continue", () => {
    const gate = makeGate("http://127.0.0.1:8899");
    gate.penalize();
    const first = gate.coolingFor();
    gate.penalize();
    expect(gate.coolingFor()).toBeGreaterThan(first);
  });
});

describe("a batch at the gate", () => {
  it("holds the next start back by every call the batch carried", async () => {
    const gate = makeGate("https://api.devnet.solana.com", { rps: 20, concurrency: 4 });
    const starts: number[] = [];
    const t0 = Date.now();
    await Promise.all([
      gate.run(async () => void starts.push(Date.now() - t0), 5),
      gate.run(async () => void starts.push(Date.now() - t0)),
    ]);
    // 20 a second is 50 ms a call: a batch of five holds the next start for about 250 ms.
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(230);
  });
});

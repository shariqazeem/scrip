import { describe, expect, it } from "vitest";
import { limitsFor, makeGate } from "./limiter";

describe("what the gate allows, by endpoint", () => {
  it("is slow for Solana's public endpoints and fast for a paid one", () => {
    expect(limitsFor("https://api.devnet.solana.com").rps).toBe(4);
    expect(limitsFor("https://api.mainnet-beta.solana.com").concurrency).toBe(2);
    expect(limitsFor("https://mainnet.helius-rpc.com/?api-key=x").rps).toBe(100);
    expect(limitsFor("http://127.0.0.1:8899").rps).toBe(2_000);
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

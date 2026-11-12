import { describe, expect, it } from "vitest";
import { REST_MS, fallbackFor, refusalOf } from "./failover";
import { gatedFetch } from "./gated-fetch";
import type { MinimalResponse } from "./http";

const MAINNET = "https://api.mainnet-beta.solana.com";
const reply = (status: number, body: string): MinimalResponse => ({ status, statusText: "", ok: status >= 200 && status < 300, text: async () => body });
const call = () => ({ method: "POST", body: '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' });

describe("fallbackFor", () => {
  it("gives a paid endpoint Solana's own on the same network", () => {
    expect(fallbackFor("https://mainnet.helius-rpc.com/?api-key=k", {})).toBe(MAINNET);
    expect(fallbackFor("https://devnet.helius-rpc.com/?api-key=k", {})).toBe("https://api.devnet.solana.com");
    expect(fallbackFor("https://solana-mainnet.g.alchemy.com/v2/k", {})).toBe(MAINNET);
  });

  it("gives none to Solana's own, a local validator, or a host that names no network", () => {
    expect(fallbackFor(MAINNET, {})).toBeNull();
    expect(fallbackFor("https://api.devnet.solana.com", {})).toBeNull();
    expect(fallbackFor("http://127.0.0.1:8899", {})).toBeNull();
    expect(fallbackFor("https://rpc.example.com/k", {})).toBeNull();
    expect(fallbackFor("not a url", {})).toBeNull();
  });

  it("can be turned off", () => {
    expect(fallbackFor("https://mainnet.helius-rpc.com/?api-key=k", { SOLANA_RPC_FALLBACK: "off" })).toBeNull();
  });
});

describe("refusalOf", () => {
  it("rests spent credits and refused keys for long, a busy or broken endpoint briefly", () => {
    expect(refusalOf(429, "max usage reached")?.kind).toBe("spent");
    expect(refusalOf(401, "invalid api key")?.kind).toBe("spent");
    expect(refusalOf(403, "")?.kind).toBe("spent");
    expect(refusalOf(429, '{"jsonrpc":"2.0","error":{"code":-32429,"message":"rate limited"}}')?.kind).toBe("unwell");
    expect(refusalOf(503, "upstream unavailable")?.kind).toBe("unwell");
  });

  it("takes any answer as an answer, a JSON-RPC error included", () => {
    expect(refusalOf(200, '{"error":{"code":-32002,"message":"Transaction simulation failed"}}')).toBeNull();
    expect(refusalOf(404, "")).toBeNull();
  });
});

describe("a paid endpoint that runs out of credits", () => {
  it("hands every call to Solana's own, rests, and takes them back once it answers", async () => {
    let t = 1_000_000;
    let spent = true;
    const paid = "https://mainnet.failover-one.example/?api-key=SECRET";
    const asked: string[] = [];
    const said: string[] = [];
    const post = async (input: unknown) => {
      const url = String(input);
      asked.push(url === paid ? "paid" : url);
      if (url === paid) return spent ? reply(429, "max usage reached") : reply(200, '{"result":"paid"}');
      return reply(200, '{"result":"public"}');
    };
    const f = gatedFetch(paid, { post, now: () => t, say: (l) => said.push(l) });

    // Asked once, not twice: spent credits are not retried. The call is answered anyway.
    expect(await (await f(paid, call())).text()).toBe('{"result":"public"}');
    expect(asked).toEqual(["paid", MAINNET]);

    // While it rests, the paid endpoint is not asked at all.
    asked.length = 0;
    t += REST_MS.spent - 1;
    await f(paid, call());
    expect(asked).toEqual([MAINNET]);

    // Then it is asked again; it answers, and every call after is its own.
    spent = false;
    t += 1;
    asked.length = 0;
    expect(await (await f(paid, call())).text()).toBe('{"result":"paid"}');
    await f(paid, call());
    expect(asked).toEqual(["paid", "paid"]);

    // One line when it refused, one when it came back, and never the key.
    expect(said).toHaveLength(2);
    expect(said[0]).toMatch(/refused \(429 max usage reached\); calls go to api\.mainnet-beta\.solana\.com/);
    expect(said[1]).toMatch(/answers again/);
    expect(said.join(" ")).not.toContain("SECRET");
  });

  it("asks again sooner after a refusal that may pass by itself", async () => {
    let t = 0;
    let down = true;
    const paid = "https://mainnet.failover-two.example/";
    const asked: string[] = [];
    const post = async (input: unknown) => {
      const url = String(input);
      asked.push(url === paid ? "paid" : "public");
      if (url === paid && down) throw new Error("socket hang up");
      return reply(200, '{"result":1}');
    };
    const f = gatedFetch(paid, { post, now: () => t, say: () => {} });
    expect(await (await f(paid, call())).text()).toBe('{"result":1}');
    expect(asked).toEqual(["paid", "public"]);
    down = false;
    t += REST_MS.unwell;
    asked.length = 0;
    await f(paid, call());
    expect(asked).toEqual(["paid"]);
  });

  it("leaves Solana's own endpoint as it was: no fallback to hand a refusal to", async () => {
    const own = "https://api.testnet.solana.com";
    const asked: string[] = [];
    const post = async (input: unknown) => {
      asked.push(String(input));
      return reply(200, '{"result":1}');
    };
    const f = gatedFetch(own, { post });
    expect((await f(own, call())).status).toBe(200);
    expect(asked).toEqual([own]);
  });
});

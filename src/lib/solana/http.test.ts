import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keepAlivePost } from "./http";

let server: Server;
let url = "";
let connections = 0;
const seen: Array<{ body: string; type: string | undefined }> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.push({ body: Buffer.concat(chunks).toString(), type: req.headers["content-type"] });
      if (seen.length === 3) {
        res.statusCode = 429;
        res.statusMessage = "Too Many Requests";
        res.end('{"error":"slow down"}');
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ ok: true, n: seen.length }));
    });
  });
  server.on("connection", () => {
    connections += 1;
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  url = typeof a === "object" && a ? `http://127.0.0.1:${a.port}/` : "";
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("the RPC transport keeps its socket", () => {
  it("carries several calls over one connection", async () => {
    for (let i = 0; i < 4; i += 1) {
      const res = await keepAlivePost(url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "getHealth" }) });
      if (i === 2) expect(res.status).toBe(429);
      else expect(res.ok).toBe(true);
    }
    // This is the whole point: four calls, one socket. undici's fetch would open four.
    expect(connections).toBe(1);
    expect(seen).toHaveLength(4);
    expect(seen[0]!.type).toBe("application/json");
  });
  it("reports a refusal instead of throwing, and hands back the body", async () => {
    const res = await keepAlivePost(url, { method: "POST", body: '{"jsonrpc":"2.0","id":9,"method":"getHealth"}' });
    expect(res.ok).toBe(true);
    expect(JSON.parse(await res.text())).toMatchObject({ ok: true });
  });
  it("rejects when the endpoint cannot be reached", async () => {
    await expect(keepAlivePost("http://127.0.0.1:1/", { method: "POST", body: "{}" })).rejects.toThrow();
  });
});

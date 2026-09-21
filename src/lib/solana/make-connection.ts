import { Connection, type ConnectionConfig } from "@solana/web3.js";
import { rpcAgent } from "./agent";
import { gatedFetch } from "./gated-fetch";

/**
 * ONE WAY TO OPEN A CONNECTION, for the app, the keeper, the scripts and the on-chain
 * battery alike. Every one of them shares the endpoint's budget through the same gate, so a
 * test run cannot spend what the site needs, and none of them retries a refusal on a clock
 * of its own.
 *
 * `connection.ts` wraps this for the server (where it is also a singleton); anything that
 * runs outside Next — `src/keeper`, `scripts/*`, `tests/*` — calls this directly.
 */
export function makeConnection(url: string, extra: Partial<ConnectionConfig> = {}): Connection {
  return new Connection(url, {
    commitment: "confirmed",
    httpAgent: rpcAgent(url),
    fetch: gatedFetch(url) as ConnectionConfig["fetch"],
    disableRetryOnRateLimit: true,
    ...extra,
  });
}

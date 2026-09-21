import "server-only";

import type { Connection } from "@solana/web3.js";
import { rpcUrl } from "./cluster";
import { makeConnection } from "./make-connection";

/**
 * THE SERVER'S CONNECTIONS. One per endpoint per process, opened the one way everything
 * opens them (`make-connection.ts`): a few warm sockets, and every call through the
 * endpoint's gate, so a page, the indexer and the keeper share one budget instead of
 * racing each other into a 429.
 */
let cached: Connection | null = null;
let cachedUrl = "";

export function connection(): Connection {
  const url = rpcUrl();
  if (!cached || cachedUrl !== url) {
    cached = makeConnection(url);
    cachedUrl = url;
  }
  return cached;
}

/**
 * MAINNET, WHATEVER THE CLUSTER. The registry's mints live on mainnet, so the market band
 * and the multiplier watcher read them there even while the program runs on devnet.
 */
let mainnet: Connection | null = null;
export function mainnetConnection(): Connection {
  if (!mainnet) mainnet = makeConnection(process.env.SOLANA_MAINNET_RPC?.trim() || process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC?.trim() || "https://api.mainnet-beta.solana.com");
  return mainnet;
}

import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";

/**
 * A FEW SOCKETS, KEPT WARM. web3.js opens a new TLS connection per request unless given an
 * agent; a page that reads twenty accounts opened twenty, and the public endpoint refuses
 * an IP past forty ("Connection rate limits exceeded"). Eight kept-alive sockets per
 * endpoint carry the same requests one after another, and a paid RPC is spared the
 * handshakes too. Shared by the app's connections and the keeper's.
 */
const SOCKETS = 8;

export function rpcAgent(url: string): HttpAgent | HttpsAgent {
  const opts = { keepAlive: true, keepAliveMsecs: 15_000, maxSockets: SOCKETS, maxFreeSockets: SOCKETS };
  return url.startsWith("https:") ? new HttpsAgent(opts) : new HttpAgent(opts);
}

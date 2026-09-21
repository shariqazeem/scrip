import { type Connection, PublicKey } from "@solana/web3.js";
import type { PriceFeed } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import { type Price, parsePriceAccount } from "./price";

/**
 * The Pyth receiver program on Solana. A price account is only a price if this program owns
 * it; anything else is 134 bytes somebody arranged to look like one.
 */
export const PYTH_RECEIVER = new PublicKey("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

/**
 * Read one pinned price account. Pinned rather than rediscovered because `getProgramAccounts`
 * is slow, often disabled on public RPC, and has no business in the path of a page render.
 */
export async function readPrice(connection: Connection, feed: PriceFeed): Promise<Outcome<Price>> {
  if (!feed.account) {
    return held(`${feed.label}: no on-chain account is pinned for this feed; the keeper posts its own.`);
  }
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(feed.account);
  } catch {
    return held(`${feed.label}: "${feed.account}" is not a valid price account address`);
  }
  return readPriceAccount(connection, pubkey, feed.feedId, feed.label);
}

/** Read any receiver-owned price account and check it carries the expected feed. */
export async function readPriceAccount(
  connection: Connection,
  pubkey: PublicKey,
  expectedFeedId: string,
  label = "price",
): Promise<Outcome<Price>> {
  let info;
  try {
    info = await connection.getAccountInfo(pubkey, "confirmed");
  } catch (err) {
    return held(`${label}: could not reach the chain (${err instanceof Error ? err.message : String(err)})`);
  }
  if (!info) return held(`${label}: price account ${pubkey.toBase58()} does not exist`);
  if (!info.owner.equals(PYTH_RECEIVER)) {
    return held(`${label}: ${pubkey.toBase58()} is not owned by the Pyth receiver program`);
  }
  const parsed = parsePriceAccount(info.data);
  if (!parsed.ok) return held(`${label}: ${parsed.why}`);
  if (expectedFeedId && parsed.value.feedId !== expectedFeedId) {
    return held(`${label}: account ${pubkey.toBase58()} carries feed ${parsed.value.feedId.slice(0, 12)}…, not the pinned one`);
  }
  return ok(parsed.value);
}

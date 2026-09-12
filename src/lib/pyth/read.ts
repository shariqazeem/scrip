import "server-only";

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
 * Read one pinned price account.
 *
 * HOW THE PINNED ADDRESSES WERE FOUND, so the next person can redo it rather than trust it:
 * scan the receiver program for accounts whose feed id (offset 41) matches, then keep the one
 * whose write authority is the account itself. That last filter is what separates the
 * continuously-updated sponsored feed from the hundreds of one-shot updates that ordinary
 * transactions leave behind — a USDC scan returns 897 accounts and exactly three are real.
 *
 * The addresses are pinned rather than rediscovered because `getProgramAccounts` is slow,
 * often disabled on public RPC, and has no business sitting in the path of a page render.
 * `valuer.live.test.ts` re-checks them against mainnet so a pin that goes stale is loud.
 */
export async function readPrice(
  connection: Connection,
  feed: PriceFeed,
): Promise<Outcome<Price>> {
  if (!feed.account) {
    // An unpriced asset is a deliberate state, not a missing config: GLDx and SLVon are fund
    // shares with no fund-share feed pinned, and pointing them at a metal feed would price a
    // share of a fund as an ounce of metal.
    return held(`${feed.label}: this asset has no price feed pinned, so it is not valued`);
  }

  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(feed.account);
  } catch {
    return held(`${feed.label}: "${feed.account}" is not a valid price account address`);
  }

  let info;
  try {
    info = await connection.getAccountInfo(pubkey, "confirmed");
  } catch (err) {
    return held(
      `${feed.label}: could not reach the chain (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  if (!info) return held(`${feed.label}: price account ${feed.account} does not exist`);
  if (!info.owner.equals(PYTH_RECEIVER)) {
    return held(`${feed.label}: ${feed.account} is not owned by the Pyth receiver program`);
  }

  const parsed = parsePriceAccount(info.data);
  if (!parsed.ok) return held(`${feed.label}: ${parsed.why}`);
  if (feed.feedId && parsed.value.feedId !== feed.feedId) {
    // The account carries its own feed id. If it disagrees with the pin, we are about to
    // price gold with something that is not gold.
    return held(
      `${feed.label}: account ${feed.account} carries feed ${parsed.value.feedId.slice(0, 12)}…, not the pinned one`,
    );
  }
  return ok(parsed.value);
}

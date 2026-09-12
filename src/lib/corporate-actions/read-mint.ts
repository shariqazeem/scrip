import "server-only";

import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getScaledUiAmountConfig, unpackMint } from "@solana/spl-token";
import type { Asset } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import type { MultiplierSnapshot } from "./multiplier";

/**
 * READ A MINT'S MULTIPLIER OFF THE CHAIN. The issuer's own account is the only authority;
 * there is no API in this path to be down, rate-limited, or quietly wrong.
 *
 * ON THE FLOAT AT THE BOUNDARY — worth being exact about, because it looks like a
 * contradiction of the no-floats rule and is not.
 *
 * The ScaledUiAmount extension stores its multiplier as an IEEE double ON CHAIN. That is the
 * issuer's representation and we cannot improve on it. What `String(f64)` gives back is the
 * shortest decimal that round-trips to the same double, so converting to a string here loses
 * nothing at all. From that string onward everything is exact integer arithmetic, which is
 * the error we CAN refuse to add: the issuer's float is theirs, the drift from multiplying a
 * balance by it in floating point would have been ours.
 *
 * A double outside the sanity band can stringify in exponent notation ("1e-7"), which
 * `parseDecimal` refuses. That refusal is correct: such a value is not a multiplier any real
 * corporate action produces, and holding is the right answer to a reading we cannot explain.
 */

/** A mint that carries no ScaledUiAmount extension — its quantity needs no adjustment. */
export type MintRead =
  | { readonly kind: "scaled"; readonly snapshot: MultiplierSnapshot }
  | { readonly kind: "unscaled"; readonly mint: string };

export async function readMintMultiplier(
  connection: Connection,
  asset: Asset,
  nowSeconds: number,
): Promise<Outcome<MintRead>> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(asset.mint);
  } catch {
    return held(`${asset.symbol}: "${asset.mint}" is not a valid mint address`);
  }

  let info;
  try {
    info = await connection.getAccountInfo(pubkey, "confirmed");
  } catch (err) {
    // The RPC being unreachable is a hold, not a crash, and the sentence says which asset.
    return held(`${asset.symbol}: could not reach the chain (${describe(err)})`);
  }
  if (!info) return held(`${asset.symbol}: mint account ${asset.mint} does not exist`);

  // A registry row claiming Token-2022 for a classic SPL mint would send us looking for an
  // extension that cannot be there. Caught here rather than by an unpack that returns junk.
  const isToken2022 = info.owner.equals(TOKEN_2022_PROGRAM_ID);
  if (asset.program === "token-2022" && !isToken2022) {
    return held(`${asset.symbol}: registry says Token-2022 but the mint is owned by ${info.owner.toBase58()}`);
  }
  if (!isToken2022) return ok({ kind: "unscaled", mint: asset.mint });

  let config;
  try {
    const mint = unpackMint(pubkey, info, info.owner);
    if (mint.decimals !== asset.decimals) {
      // Decimals are the difference between $1 and $100. A registry that disagrees with the
      // mint is not a nit — every quantity computed from it is wrong by a power of ten.
      return held(
        `${asset.symbol}: registry says ${asset.decimals} decimals, the mint says ${mint.decimals}`,
      );
    }
    config = getScaledUiAmountConfig(mint);
  } catch (err) {
    return held(`${asset.symbol}: could not decode the mint (${describe(err)})`);
  }

  if (!config) {
    if (asset.hasMultiplier) {
      return held(`${asset.symbol}: registry expects a multiplier but the mint carries none`);
    }
    return ok({ kind: "unscaled", mint: asset.mint });
  }

  return ok({
    kind: "scaled",
    snapshot: {
      mint: asset.mint,
      multiplier: String(config.multiplier),
      newMultiplier: String(config.newMultiplier),
      effectiveAt: Number(config.newMultiplierEffectiveTimestamp),
      seenAt: nowSeconds,
    },
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getPausableConfig, getScaledUiAmountConfig, unpackMint } from "@solana/spl-token";
import type { Asset } from "@/lib/assets/registry";
import { type Outcome, held, ok } from "@/lib/outcome";
import type { MultiplierSnapshot } from "./multiplier";

/**
 * READ A MINT'S MULTIPLIER OFF THE CHAIN. The issuer's own account is the only authority.
 *
 * ON THE FLOAT AT THE BOUNDARY: the extension stores its multiplier as an IEEE double on
 * chain. `String(f64)` gives the shortest decimal that round-trips to the same double, so
 * converting to a string here loses nothing. From that string onward everything is exact.
 */
export type MintRead =
  | { readonly kind: "scaled"; readonly snapshot: MultiplierSnapshot; readonly paused: boolean }
  | { readonly kind: "unscaled"; readonly mint: string; readonly paused: boolean };

export async function readMintMultiplier(connection: Connection, asset: Asset, nowSeconds: number): Promise<Outcome<MintRead>> {
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
    return held(`${asset.symbol}: could not reach the chain (${describe(err)})`);
  }
  if (!info) return held(`${asset.symbol}: mint account ${asset.mint} does not exist`);

  const isToken2022 = info.owner.equals(TOKEN_2022_PROGRAM_ID);
  if (asset.program === "token-2022" && !isToken2022) {
    return held(`${asset.symbol}: registry says Token-2022 but the mint is owned by ${info.owner.toBase58()}`);
  }
  if (!isToken2022) return ok({ kind: "unscaled", mint: asset.mint, paused: false });

  let config;
  let paused = false;
  try {
    const mint = unpackMint(pubkey, info, info.owner);
    if (mint.decimals !== asset.decimals) {
      return held(`${asset.symbol}: registry says ${asset.decimals} decimals, the mint says ${mint.decimals}`);
    }
    config = getScaledUiAmountConfig(mint);
    paused = getPausableConfig(mint)?.paused ?? false;
  } catch (err) {
    return held(`${asset.symbol}: could not decode the mint (${describe(err)})`);
  }

  if (!config) {
    if (asset.powers.hasMultiplier) {
      return held(`${asset.symbol}: registry expects a multiplier but the mint carries none`);
    }
    return ok({ kind: "unscaled", mint: asset.mint, paused });
  }

  return ok({
    kind: "scaled",
    paused,
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

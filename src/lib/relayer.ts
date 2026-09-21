import "server-only";

import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

/**
 * THE RELAYER — pays the fee and the rents on a claim so an empty wallet can take a first
 * position. It signs as fee payer and nothing else; the escrow goes to the claimer and the
 * receipt names the sponsor. Falls back to the crank's key, which does the same kind of job.
 */
export function relayerKeypair(): Keypair | null {
  const raw = (process.env.SCRIP_RELAYER_KEYPAIR ?? process.env.SCRIP_CRANK_KEYPAIR)?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith("[") ? raw : readFileSync(raw, "utf8");
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(json) as number[]));
  } catch {
    return null;
  }
}

import "server-only";

import { readFileSync } from "node:fs";
import { Keypair } from "@solana/web3.js";

/**
 * THE RELAYER — pays the fee and the rents on a claim so an empty wallet can take a first
 * position. It signs as fee payer and nothing else; the escrow goes to the claimer and the
 * receipt names the sponsor. Falls back to the crank's key, which does the same kind of job.
 */
/**
 * WHOSE PAYMENTS THE RELAYER SPONSORS. A sponsored claim pays rents the claimer can later
 * reclaim — close the register, close the token account — so an open sponsor is a faucet: gift
 * yourself a cent of stock, claim it on Scrip's fee, close everything, keep about 0.005 SOL,
 * repeat. `SPONSOR_PAYERS` (comma-separated addresses) limits sponsorship to payments from the
 * wallets Scrip pays from and the organisations it has onboarded. Anyone else's recipients
 * still claim — at their own cost, under 0.009 SOL — so nothing is ever a dead end.
 * Unset: every payer is sponsored, which is what a local or devnet deployment wants.
 */
export function sponsorsPayer(payer: string | null | undefined, list: string | undefined = process.env.SPONSOR_PAYERS): boolean {
  const allowed = (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  return typeof payer === "string" && allowed.includes(payer.trim());
}

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

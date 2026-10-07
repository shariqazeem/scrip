import { PublicKey } from "@solana/web3.js";
import { SCRIP_PROGRAM_ID } from "@/lib/solana/program";

/**
 * HOW A SAVE IS KNOWN — two marks, both in the transaction, both public.
 *
 * A save is a plain Jupiter swap the saver signs. Scrip's program is not in it, so nothing
 * on chain is written by Scrip, and the receipt has to be read from the transaction itself.
 * Two things make a save a save:
 *
 *   THE MEMO     `scrip:save:v1`, signed by the saver. It says what the transaction was for.
 *   THE MARK     one fixed address, carried read-only in the transaction (the Solana Pay
 *                "reference" convention). Every transaction that names an address is
 *                listed by `getSignaturesForAddress(address)`, so anybody can enumerate every
 *                save ever made through Scrip from this one key, without Scrip's database.
 *
 * The mark is a program address of Scrip's program with the seed "save": off the curve, so
 * nobody holds a key for it, and derived from Scrip's own id, so a stranger can recompute
 * it. The seed is reserved; no account of the program may ever use it.
 */
export const SAVE_MEMO = "scrip:save:v1";
export const SAVE_MARK_SEED = "save";

export const SAVE_MARK: PublicKey = PublicKey.findProgramAddressSync([Buffer.from(SAVE_MARK_SEED)], SCRIP_PROGRAM_ID)[0];

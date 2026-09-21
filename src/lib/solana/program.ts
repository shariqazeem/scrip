import { BorshAccountsCoder, BorshInstructionCoder, type Idl } from "@coral-xyz/anchor";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import idl from "@/lib/anchor/scrip.json";
import { type Outcome, held, ok } from "@/lib/outcome";

/**
 * THE PROGRAM'S ADDRESS, DERIVED FROM THE IDL AND NOWHERE ELSE.
 *
 * The same id is written in three places by three tools — `declare_id!` in the program,
 * `[programs.*]` in Anchor.toml, and the IDL's `address`. Nothing in TypeScript re-types it:
 * this reads the IDL, and `program.test.ts` reads all three and fails if any pair disagrees.
 */
export const SCRIP_IDL = idl as Idl;
export const SCRIP_PROGRAM_ID = new PublicKey(idl.address);

/** PDA seeds, defined once. A seed literal retyped at a call site is a silently wrong address. */
export const SEED = {
  book: "book",
  handle: "handle",
  payout: "payout",
  receipt: "receipt",
} as const;

/** `["book", owner]` — one per owner, and the token delegate address. */
export function bookPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(SEED.book), owner.toBuffer()], SCRIP_PROGRAM_ID)[0];
}

/** `["handle", slug]` — what `/pay/<slug>` resolves through. */
export function handlePda(slug: string): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(SEED.handle), Buffer.from(slug)], SCRIP_PROGRAM_ID)[0];
}

/** `["payout", payer, release_id]` — the escrow, and the only thing the program holds. */
export function payoutPda(payer: PublicKey, releaseId: Uint8Array): PublicKey {
  assertReleaseId(releaseId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEED.payout), payer.toBuffer(), Buffer.from(releaseId)],
    SCRIP_PROGRAM_ID,
  )[0];
}

/**
 * `["receipt", subject, release_id]` — the subject is the Book for a sweep and the Payout
 * for an intake. Derivable by anyone who knows both, which is the point: a receipt nobody
 * but us can find is not a public record.
 */
/** `["grant", payer, grant_id]` — the escrow a grant vests from. */
export function grantPda(payer: PublicKey, grantId: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("grant"), payer.toBuffer(), Buffer.from(grantId)], SCRIP_PROGRAM_ID)[0];
}

export function receiptPda(subject: PublicKey, releaseId: Uint8Array): PublicKey {
  assertReleaseId(releaseId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEED.receipt), subject.toBuffer(), Buffer.from(releaseId)],
    SCRIP_PROGRAM_ID,
  )[0];
}

function assertReleaseId(id: Uint8Array): void {
  if (id.length !== 16) throw new Error(`a release id is 16 bytes; got ${id.length}`);
}

/** Sixteen random bytes. One per sweep, one per intake. */
export function newReleaseId(): Uint8Array {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return b;
}

export function releaseIdFromHex(hex: string): Outcome<Uint8Array> {
  if (!/^[0-9a-f]{32}$/i.test(hex)) return held("A release id is 32 hex characters.");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return ok(out);
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

// ── encoding, from the IDL and nowhere else ──────────────────────────────────────────────

const ixCoder = new BorshInstructionCoder(SCRIP_IDL);
const accountsCoder = new BorshAccountsCoder(SCRIP_IDL);

type IdlAccountMeta = { name: string; writable?: boolean; signer?: boolean; optional?: boolean; address?: string };

/**
 * Build an instruction from the IDL's own account list.
 *
 * The account ORDER is the IDL's, not the caller's: a caller supplies a name → key map, and
 * this walks the IDL to place each one. A hand-written `keys` array is how an account lands
 * one slot off and the program reads the wrong thing as the right thing. Optional accounts
 * that are not supplied take the program id, which is how Anchor spells "absent".
 *
 * FIELD NAMES ARE snake_case, as the IDL spells them. Anchor's Borsh coder encodes ZERO for a
 * field it cannot find rather than throwing — a camelCase arg name here silently sends 0.
 */
export function buildIx(
  name: string,
  args: Record<string, unknown>,
  accounts: Record<string, PublicKey | undefined>,
): Outcome<TransactionInstruction> {
  const def = idl.instructions.find((i) => i.name === name);
  if (!def) return held(`The IDL has no instruction named ${name}.`);
  let data: Buffer;
  try {
    data = ixCoder.encode(name, args);
  } catch (err) {
    return held(`${name} could not be encoded: ${err instanceof Error ? err.message : String(err)}`);
  }
  const keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = [];
  for (const a of def.accounts as IdlAccountMeta[]) {
    const supplied = accounts[a.name] ?? (a.address ? new PublicKey(a.address) : undefined);
    if (!supplied) {
      if (a.optional) {
        keys.push({ pubkey: SCRIP_PROGRAM_ID, isSigner: false, isWritable: false });
        continue;
      }
      return held(`${name} needs the account "${a.name}".`);
    }
    keys.push({ pubkey: supplied, isSigner: !!a.signer, isWritable: !!a.writable });
  }
  return ok(new TransactionInstruction({ programId: SCRIP_PROGRAM_ID, keys, data }));
}

/** Decode an instruction's data, for tests and for reading a transaction back. */
export function decodeIx(data: Buffer | Uint8Array): { name: string; data: unknown } | null {
  return ixCoder.decode(Buffer.from(data));
}

/** The eight-byte discriminator of a named account type. */
export function accountDiscriminator(name: string): Uint8Array {
  const found = idl.accounts.find((a) => a.name === name);
  if (!found) throw new Error(`the IDL has no account named ${name}`);
  return Uint8Array.from(found.discriminator);
}

/** Decode an account of a named type. Holds on the wrong discriminator or a short buffer. */
export function decodeAccount<T>(name: string, data: Uint8Array): Outcome<T> {
  const disc = accountDiscriminator(name);
  if (data.length < 8) return held(`${name}: the account is too short.`);
  for (let i = 0; i < 8; i += 1) {
    if (data[i] !== disc[i]) return held(`${name}: this account is not a ${name}.`);
  }
  try {
    return ok(accountsCoder.decode<T>(name, Buffer.from(data)));
  } catch (err) {
    return held(`${name}: could not be decoded (${err instanceof Error ? err.message : String(err)}).`);
  }
}

/** A memcmp filter on a discriminator, for `getProgramAccounts`. */
export function discriminatorFilter(name: string): { memcmp: { offset: number; bytes: string } } {
  return { memcmp: { offset: 0, bytes: toBase58(accountDiscriminator(name)) } };
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function toBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

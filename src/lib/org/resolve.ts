import "server-only";

import { PublicKey } from "@solana/web3.js";
import { type Asset, defaultAsset } from "@/lib/assets/registry";
import { resolveAsset } from "@/lib/assets/stand-in";
import { readBookOf, readHandle } from "@/lib/book/read-book";
import { validateSlug } from "@/lib/handle";
import { type Outcome, held, ok } from "@/lib/outcome";
import { connection } from "@/lib/solana/connection";

/**
 * WHO A PAYMENT GOES TO. A handle or an address; with a register (it lands now, in the
 * register's asset) or without (it waits in escrow for a claim, in the payer's chosen asset).
 */
export type Recipient = {
  readonly owner: string;
  readonly handle: string | null;
  readonly hasBook: boolean;
  /** The asset a payment to them becomes: their register's, or the default. */
  readonly asset: Asset;
  readonly kind: "person" | "org" | null;
};

export async function resolveRecipient(to: string, preferredAsset?: Asset | null): Promise<Outcome<Recipient>> {
  const raw = to.trim().replace(/^@/, "");
  const slug = validateSlug(raw);
  let owner: string;
  let handle: string | null = null;
  let kind: "person" | "org" | null = null;
  if (slug.ok) {
    const h = await readHandle(slug.value);
    if (!h.ok) return h;
    if (!h.value) return held(`Nobody has @${slug.value}.`);
    owner = h.value.owner;
    handle = slug.value;
    kind = h.value.kind;
  } else {
    try {
      const key = new PublicKey(raw);
      if (!PublicKey.isOnCurve(key.toBytes())) return held("That address is a program account; nobody could spend what lands there.");
      owner = key.toBase58();
    } catch {
      return held("That is neither a handle nor a Solana address.");
    }
  }
  const book = await readBookOf(connection(), new PublicKey(owner));
  if (!book.ok) return book;
  if (book.value) {
    const asset = await resolveAsset(book.value.asset);
    if (!asset) return held("Their register's asset is not on the registry.");
    return ok({ owner, handle: handle ?? book.value.slug, hasBook: true, asset, kind });
  }
  return ok({ owner, handle, hasBook: false, asset: preferredAsset ?? defaultAsset(), kind });
}

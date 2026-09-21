import type { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { type Outcome, held, map } from "@/lib/outcome";
import { decodeAccount, toHex } from "@/lib/solana/program";

/**
 * THE ON-CHAIN ACCOUNTS, DECODED THROUGH THE IDL — never by hand-counted offsets.
 *
 * The coder reads the committed IDL, which is the built program's own description of its
 * layouts. A field added to the Rust and rebuilt is a field these types gain by re-running
 * `anchor:build`; a hand-decoder would silently read the next field's bytes as this one's.
 */

export type Rule = {
  readonly enabled: boolean;
  readonly rateBps: number;
  readonly escalateBps: number;
  readonly floorUsdc: bigint;
  readonly capUsdc: bigint;
  readonly minInbound: bigint;
  readonly toleranceBps: number;
  readonly watermark: bigint;
  readonly enabledUnix: number;
  readonly sweeps: number;
};

export type Pending = {
  readonly releaseId: string;
  readonly keeper: string;
  readonly inbound: bigint;
  readonly rateBps: number;
  readonly slice: bigint;
  readonly usdcBefore: bigint;
  readonly assetBeforeRaw: bigint;
  readonly ataRent: bigint;
  readonly slot: bigint;
};

export type Book = {
  readonly owner: string;
  readonly slug: string;
  readonly asset: string;
  readonly usdcMint: string;
  readonly feedRaw: string;
  readonly feedAdjusted: string;
  readonly termsVersion: number;
  readonly openedUnix: number;
  readonly rule: Rule;
  readonly pending: Pending | null;
};

/** A stock swept under a rule, paid, given to an empty wallet, granted on a schedule, or vested. */
export type ReceiptKind = "sweep" | "pay" | "gift" | "grant" | "vest";
export const RECEIPT_KINDS: readonly ReceiptKind[] = ["sweep", "pay", "gift", "grant", "vest"];

export type PriceStamp = {
  readonly feed: string;
  readonly price: bigint;
  readonly expo: number;
  readonly conf: bigint;
  readonly publishTime: number;
} | null;

export type Measurement = { readonly at: number; readonly balanceRaw: bigint } | null;

export type Receipt = {
  readonly kind: ReceiptKind;
  readonly recipient: string;
  /** null for a sweep. */
  readonly payer: string | null;
  readonly submitter: string;
  readonly book: string;
  readonly releaseId: string;
  /** The payroll run this receipt belongs to, or null. */
  readonly runId: string | null;
  readonly reasonHash: Uint8Array;
  readonly basisUsdc: bigint;
  readonly rateBps: number;
  readonly paidUsdc: bigint;
  readonly asset: string;
  readonly amountRaw: bigint;
  readonly price: PriceStamp;
  readonly settledSlot: bigint;
  readonly settledUnix: number;
  readonly measured7d: Measurement;
  readonly measured30d: Measurement;
};

export type PayoutKind = "pay" | "gift";

export type Payout = {
  readonly payer: string;
  readonly recipient: string | null;
  readonly claimant: string | null;
  readonly kind: PayoutKind;
  readonly releaseId: string;
  readonly reasonHash: Uint8Array;
  readonly declaredUsdc: bigint;
  readonly asset: string;
  readonly minOutRaw: bigint;
  readonly createdUnix: number;
  readonly runId: string | null;
};

export type HandleKind = "person" | "org";
export type Handle = { readonly owner: string; readonly kind: HandleKind };

export type GrantState = "active" | "completed" | "revoked";
export type Grant = {
  readonly payer: string;
  readonly recipient: string;
  readonly asset: string;
  readonly grantId: string;
  readonly totalRaw: bigint;
  readonly releasedRaw: bigint;
  /** After a revoke, the most that may ever be released; null while unrevoked. */
  readonly releaseCapRaw: bigint | null;
  readonly startUnix: number;
  readonly cliffSecs: number;
  readonly durationSecs: number;
  readonly revocable: boolean;
  readonly sealed: boolean;
  readonly state: GrantState;
  readonly reasonHash: Uint8Array;
  readonly declaredUsdc: bigint;
  readonly minOutRaw: bigint;
  readonly runId: string | null;
  readonly createdUnix: number;
  readonly vests: number;
};

/** The schedule, mirrored from `Grant::scheduled_raw` and held against it by a test. */
export function scheduledRaw(g: Pick<Grant, "totalRaw" | "startUnix" | "cliffSecs" | "durationSecs">, now: number): bigint {
  const elapsed = now - g.startUnix - g.cliffSecs;
  if (elapsed < 0) return 0n;
  if (g.durationSecs === 0) return g.totalRaw;
  const e = BigInt(Math.min(elapsed, g.durationSecs));
  return (g.totalRaw * e) / BigInt(g.durationSecs);
}
export function releasableRaw(g: Pick<Grant, "totalRaw" | "startUnix" | "cliffSecs" | "durationSecs" | "releasedRaw" | "releaseCapRaw">, now: number): bigint {
  const scheduled = scheduledRaw(g, now);
  const capped = g.releaseCapRaw !== null && g.releaseCapRaw < scheduled ? g.releaseCapRaw : scheduled;
  return capped > g.releasedRaw ? capped - g.releasedRaw : 0n;
}

type RawRule = {
  enabled: boolean;
  rate_bps: number;
  escalate_bps: number;
  floor_usdc: BN;
  cap_usdc: BN;
  min_inbound: BN;
  tolerance_bps: number;
  watermark: BN;
  enabled_unix: BN;
  sweeps: number;
};
type RawPending = {
  release_id: number[];
  keeper: PublicKey;
  inbound: BN;
  rate_bps: number;
  slice: BN;
  usdc_before: BN;
  asset_before_raw: BN;
  ata_rent: BN;
  slot: BN;
};
type RawBook = {
  owner: PublicKey;
  slug: string;
  asset: PublicKey;
  usdc_mint: PublicKey;
  feed_raw: number[];
  feed_adjusted: number[];
  terms_version: number;
  opened_unix: BN;
  bump: number;
  rule: RawRule;
  pending: RawPending | null;
};

const big = (b: BN): bigint => BigInt(b.toString());
const bytes = (a: number[]): Uint8Array => Uint8Array.from(a);
const optionalKey = (k: PublicKey): string | null => (k.equals(PublicKey.default) ? null : k.toBase58());
const zero32 = (a: number[]): boolean => a.every((b) => b === 0);
const optionalId = (a: number[]): string | null => (zero32(a) ? null : toHex(bytes(a)));

export function decodeBook(data: Uint8Array): Outcome<Book> {
  return map(decodeAccount<RawBook>("Book", data), (r) => ({
    owner: r.owner.toBase58(),
    slug: r.slug,
    asset: r.asset.toBase58(),
    usdcMint: r.usdc_mint.toBase58(),
    feedRaw: zero32(r.feed_raw) ? "" : toHex(bytes(r.feed_raw)),
    feedAdjusted: zero32(r.feed_adjusted) ? "" : toHex(bytes(r.feed_adjusted)),
    termsVersion: r.terms_version,
    openedUnix: Number(r.opened_unix.toString()),
    rule: {
      enabled: r.rule.enabled,
      rateBps: r.rule.rate_bps,
      escalateBps: r.rule.escalate_bps,
      floorUsdc: big(r.rule.floor_usdc),
      capUsdc: big(r.rule.cap_usdc),
      minInbound: big(r.rule.min_inbound),
      toleranceBps: r.rule.tolerance_bps,
      watermark: big(r.rule.watermark),
      enabledUnix: Number(r.rule.enabled_unix.toString()),
      sweeps: r.rule.sweeps,
    },
    pending: r.pending
      ? {
          releaseId: toHex(bytes(r.pending.release_id)),
          keeper: r.pending.keeper.toBase58(),
          inbound: big(r.pending.inbound),
          rateBps: r.pending.rate_bps,
          slice: big(r.pending.slice),
          usdcBefore: big(r.pending.usdc_before),
          assetBeforeRaw: big(r.pending.asset_before_raw),
          ataRent: big(r.pending.ata_rent),
          slot: big(r.pending.slot),
        }
      : null,
  }));
}

type RawReceipt = {
  kind: Record<string, object>;
  recipient: PublicKey;
  payer: PublicKey;
  submitter: PublicKey;
  book: PublicKey;
  release_id: number[];
  run_id: number[];
  reason_hash: number[];
  basis_usdc: BN;
  rate_bps: number;
  paid_usdc: BN;
  asset: PublicKey;
  amount_raw: BN;
  price: { feed: number[]; price: BN; expo: number; conf: BN; publish_time: BN };
  settled_slot: BN;
  settled_unix: BN;
  measured_7d: { at: BN; balance_raw: BN };
  measured_30d: { at: BN; balance_raw: BN };
};

function enumName(e: Record<string, object>): string {
  return (Object.keys(e)[0] ?? "").toLowerCase();
}

export function decodeReceipt(data: Uint8Array): Outcome<Receipt> {
  return map(decodeAccount<RawReceipt>("Receipt", data), (r) => {
    const kind = enumName(r.kind);
    const measurement = (m: { at: BN; balance_raw: BN }): Measurement =>
      m.at.isZero() ? null : { at: Number(m.at.toString()), balanceRaw: big(m.balance_raw) };
    return {
      kind: (RECEIPT_KINDS as readonly string[]).includes(kind) ? (kind as ReceiptKind) : "sweep",
      recipient: r.recipient.toBase58(),
      payer: optionalKey(r.payer),
      submitter: r.submitter.toBase58(),
      book: r.book.toBase58(),
      releaseId: toHex(bytes(r.release_id)),
      runId: optionalId(r.run_id),
      reasonHash: bytes(r.reason_hash),
      basisUsdc: big(r.basis_usdc),
      rateBps: r.rate_bps,
      paidUsdc: big(r.paid_usdc),
      asset: r.asset.toBase58(),
      amountRaw: big(r.amount_raw),
      price: zero32(r.price.feed)
        ? null
        : {
            feed: toHex(bytes(r.price.feed)),
            price: big(r.price.price),
            expo: r.price.expo,
            conf: big(r.price.conf),
            publishTime: Number(r.price.publish_time.toString()),
          },
      settledSlot: big(r.settled_slot),
      settledUnix: Number(r.settled_unix.toString()),
      measured7d: measurement(r.measured_7d),
      measured30d: measurement(r.measured_30d),
    };
  });
}

type RawPayout = {
  payer: PublicKey;
  recipient: PublicKey;
  claimant: PublicKey;
  kind: Record<string, object>;
  release_id: number[];
  reason_hash: number[];
  declared_usdc: BN;
  asset: PublicKey;
  min_out_raw: BN;
  created_unix: BN;
  run_id: number[];
};

export function decodePayout(data: Uint8Array): Outcome<Payout> {
  return map(decodeAccount<RawPayout>("Payout", data), (r) => ({
    payer: r.payer.toBase58(),
    recipient: optionalKey(r.recipient),
    claimant: optionalKey(r.claimant),
    kind: enumName(r.kind) === "sponsor" ? "gift" : "pay",
    releaseId: toHex(bytes(r.release_id)),
    reasonHash: bytes(r.reason_hash),
    declaredUsdc: big(r.declared_usdc),
    asset: r.asset.toBase58(),
    minOutRaw: big(r.min_out_raw),
    createdUnix: Number(r.created_unix.toString()),
    runId: optionalId(r.run_id),
  }));
}

export function decodeHandle(data: Uint8Array): Outcome<Handle> {
  return map(decodeAccount<{ owner: PublicKey; kind: Record<string, object> }>("Handle", data), (r) => ({
    owner: r.owner.toBase58(),
    kind: enumName(r.kind) === "org" ? "org" : "person",
  }));
}

type RawGrant = {
  payer: PublicKey;
  recipient: PublicKey;
  asset: PublicKey;
  grant_id: number[];
  total_raw: BN;
  released_raw: BN;
  release_cap_raw: BN;
  start_unix: BN;
  cliff_secs: number;
  duration_secs: number;
  revocable: boolean;
  sealed: boolean;
  state: Record<string, object>;
  reason_hash: number[];
  declared_usdc: BN;
  min_out_raw: BN;
  run_id: number[];
  created_unix: BN;
  vests: number;
};

const U64_MAX = (1n << 64n) - 1n;

export function decodeGrant(data: Uint8Array): Outcome<Grant> {
  return map(decodeAccount<RawGrant>("Grant", data), (r) => {
    const state = enumName(r.state);
    const cap = big(r.release_cap_raw);
    return {
      payer: r.payer.toBase58(),
      recipient: r.recipient.toBase58(),
      asset: r.asset.toBase58(),
      grantId: toHex(bytes(r.grant_id)),
      totalRaw: big(r.total_raw),
      releasedRaw: big(r.released_raw),
      releaseCapRaw: cap === U64_MAX ? null : cap,
      startUnix: Number(r.start_unix.toString()),
      cliffSecs: r.cliff_secs,
      durationSecs: r.duration_secs,
      revocable: r.revocable,
      sealed: r.sealed,
      state: (state === "completed" || state === "revoked" ? state : "active") as GrantState,
      reasonHash: bytes(r.reason_hash),
      declaredUsdc: big(r.declared_usdc),
      minOutRaw: big(r.min_out_raw),
      runId: optionalId(r.run_id),
      createdUnix: Number(r.created_unix.toString()),
      vests: r.vests,
    };
  });
}

/** For a caller that has an account but no idea what it is. */
export function whatIsThis(data: Uint8Array): "Book" | "Handle" | "Payout" | "Receipt" | "Grant" | null {
  for (const name of ["Book", "Handle", "Payout", "Receipt", "Grant"] as const) {
    if (decodeAccount(name, data).ok) return name;
  }
  return null;
}

export function heldUnless<T>(o: Outcome<T>, why: string): Outcome<T> {
  return o.ok ? o : held(why);
}

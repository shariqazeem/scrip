import { PublicKey } from "@solana/web3.js";

/**
 * A MATCH, AS THE CHAIN TELLS IT — `match_receipt` emits a `Matched` event in its own
 * transaction: which Plan, whose save, which receipt, the sponsor, the USDC it was worth, the
 * stock it moved and the Pyth price it was priced at. Anchor writes an event as a log line,
 * `Program data: <base64>`, the event's eight-byte discriminator then its fields in order. The
 * layout is fixed (no option, no vector), so it is read by offset; a test holds it to the IDL.
 */
export const MATCHED_DISCRIMINATOR = [215, 215, 126, 179, 36, 175, 178, 4] as const;
/** 8 + four keys + usdc + amount_raw + feed + price + expo + conf + publish_time + at. */
export const MATCHED_LEN = 8 + 32 * 4 + 8 + 8 + 32 + 8 + 4 + 8 + 8 + 8;

export type Matched = {
  readonly plan: string;
  readonly owner: string;
  readonly receipt: string;
  readonly sponsor: string;
  /** What the match was worth, in USDC base units, as the program priced it. */
  readonly usdc: bigint;
  /** The stock it moved from the escrow to the owner, in the mint's raw units. */
  readonly amountRaw: bigint;
  readonly price: bigint;
  readonly expo: number;
  readonly publishTime: number;
  readonly at: number;
};

export function decodeMatched(bytes: Uint8Array): Matched | null {
  if (bytes.length < MATCHED_LEN) return null;
  for (let i = 0; i < 8; i++) if (bytes[i] !== MATCHED_DISCRIMINATOR[i]) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const key = (o: number) => new PublicKey(bytes.subarray(o, o + 32)).toBase58();
  let o = 8;
  const plan = key(o);
  const owner = key((o += 32));
  const receipt = key((o += 32));
  const sponsor = key((o += 32));
  o += 32;
  const usdc = view.getBigUint64(o, true);
  const amountRaw = view.getBigUint64((o += 8), true);
  o += 8 + 32; // the feed id: the receipt already names the price it settled at
  const price = view.getBigInt64(o, true);
  const expo = view.getInt32((o += 8), true);
  o += 4 + 8; // conf
  const publishTime = Number(view.getBigInt64(o, true));
  const at = Number(view.getBigInt64((o += 8), true));
  return { plan, owner, receipt, sponsor, usdc, amountRaw, price, expo, publishTime, at };
}

/** Every `Matched` event in a transaction's logs. Lines that are not one are skipped. */
export function matchedFromLogs(logs: readonly string[] | null | undefined): Matched[] {
  const out: Matched[] = [];
  for (const line of logs ?? []) {
    if (!line.startsWith("Program data: ")) continue;
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(Buffer.from(line.slice("Program data: ".length).trim(), "base64"));
    } catch {
      continue;
    }
    const m = decodeMatched(bytes);
    if (m) out.push(m);
  }
  return out;
}

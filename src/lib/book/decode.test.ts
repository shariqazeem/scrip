/**
 * @vitest-environment node
 */
import { BN, BorshAccountsCoder } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { SCRIP_IDL, accountDiscriminator } from "@/lib/solana/program";
import { decodeBook, decodePayout, decodeReceipt, whatIsThis } from "./decode";

/**
 * The coder encodes what the coder decodes, so a round trip proves only that the two halves
 * agree with each other — but they agree THROUGH THE IDL, which is the program's own layout.
 * What this holds is the mapping from IDL names to the product's names, and the rules for
 * "absent": a default pubkey is null, a zero feed is null, a zero timestamp is unmeasured.
 */
const coder = new BorshAccountsCoder(SCRIP_IDL);

async function encode(name: string, value: object): Promise<Uint8Array> {
  return new Uint8Array(await coder.encode(name, value));
}

const owner = Keypair.generate().publicKey;
const asset = Keypair.generate().publicKey;

describe("decodeBook", () => {
  it("maps every field and reads an absent pending as null", async () => {
    const data = await encode("Book", {
      owner,
      slug: "shariq",
      asset,
      usdc_mint: PublicKey.default,
      feed_raw: Array(32).fill(7),
      feed_adjusted: Array(32).fill(0),
      terms_version: 1,
      opened_unix: new BN(1_789_000_000),
      bump: 254,
      rule: {
        enabled: true,
        rate_bps: 1_000,
        escalate_bps: 100,
        floor_usdc: new BN(0),
        cap_usdc: new BN(5_000_000_000),
        min_inbound: new BN(1_000_000),
        tolerance_bps: 100,
        watermark: new BN(123_456_789),
        enabled_unix: new BN(1_789_000_100),
        sweeps: 3,
      },
      pending: null,
    });
    const b = decodeBook(data);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    expect(b.value.owner).toBe(owner.toBase58());
    expect(b.value.slug).toBe("shariq");
    expect(b.value.feedRaw).toBe("07".repeat(32));
    expect(b.value.feedAdjusted).toBe("");
    expect(b.value.rule.capUsdc).toBe(5_000_000_000n);
    expect(b.value.rule.watermark).toBe(123_456_789n);
    expect(b.value.rule.sweeps).toBe(3);
    expect(b.value.pending).toBeNull();
    expect(whatIsThis(data)).toBe("Book");
  });

  it("refuses an account of another type", async () => {
    const data = await encode("Handle", { owner, bump: 1, kind: { Person: {} } });
    expect(decodeBook(data).ok).toBe(false);
    expect(whatIsThis(data)).toBe("Handle");
    expect(whatIsThis(new Uint8Array(3))).toBeNull();
  });
});

describe("decodeReceipt", () => {
  const base = {
    recipient: owner,
    payer: PublicKey.default,
    submitter: Keypair.generate().publicKey,
    book: Keypair.generate().publicKey,
    release_id: Array(16).fill(1),
    reason_hash: Array(32).fill(0),
    basis_usdc: new BN(200_000_000),
    rate_bps: 1_000,
    paid_usdc: new BN(20_000_000),
    asset,
    amount_raw: new BN(2_620_000),
    price: { feed: Array(32).fill(9), price: new BN(76_991_499_999), expo: -8, conf: new BN(20_800_595), publish_time: new BN(1_789_000_000) },
    run_id: Array(16).fill(0),
    settled_slot: new BN(500_000_000),
    settled_unix: new BN(1_789_000_050),
    measured_7d: { at: new BN(0), balance_raw: new BN(0) },
    measured_30d: { at: new BN(1_789_700_000), balance_raw: new BN(2_620_000) },
    bump: 255,
  };

  it("reads a sweep: no payer, a price stamp, one window measured", async () => {
    const r = decodeReceipt(await encode("Receipt", { ...base, kind: { Sweep: {} } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("sweep");
    expect(r.value.payer).toBeNull();
    expect(r.value.basisUsdc).toBe(200_000_000n);
    expect(r.value.paidUsdc).toBe(20_000_000n);
    expect(r.value.amountRaw).toBe(2_620_000n);
    expect(r.value.price?.price).toBe(76_991_499_999n);
    expect(r.value.price?.expo).toBe(-8);
    expect(r.value.measured7d).toBeNull();
    expect(r.value.measured30d).toEqual({ at: 1_789_700_000, balanceRaw: 2_620_000n });
  });

  it("reads a payment: a payer, a run id, and no stamp when the feed is zero", async () => {
    const payer = Keypair.generate().publicKey;
    const r = decodeReceipt(
      await encode("Receipt", { ...base, kind: { Pay: {} }, payer, run_id: Array(16).fill(4), price: { ...base.price, feed: Array(32).fill(0) } }),
    );
    expect(r.ok && r.value.kind).toBe("pay");
    expect(r.ok && r.value.payer).toBe(payer.toBase58());
    expect(r.ok && r.value.price).toBeNull();
    expect(r.ok && r.value.runId).toBe("04".repeat(16));
  });

  it("reads every kind by its IDL name", async () => {
    for (const [variant, name] of [["Sweep", "sweep"], ["Pay", "pay"], ["Gift", "gift"], ["Grant", "grant"], ["Vest", "vest"]] as const) {
      const r = decodeReceipt(await encode("Receipt", { ...base, kind: { [variant]: {} } }));
      expect(r.ok && r.value.kind).toBe(name);
    }
  });

  it("carries the anchor discriminator the indexer filters on", async () => {
    const data = await encode("Receipt", { ...base, kind: { Gift: {} } });
    expect(Buffer.from(data.subarray(0, 8))).toEqual(Buffer.from(accountDiscriminator("Receipt")));
  });
});

describe("decodePayout", () => {
  it("reads a gift addressed to a claim key", async () => {
    const claimant = Keypair.generate().publicKey;
    const data = await encode("Payout", {
      payer: owner,
      recipient: PublicKey.default,
      claimant,
      kind: { Sponsor: {} },
      release_id: Array(16).fill(2),
      reason_hash: Array(32).fill(3),
      declared_usdc: new BN(5_000_000),
      asset,
      min_out_raw: new BN(640_000),
      created_unix: new BN(1_789_000_000),
      run_id: Array(16).fill(0),
      bump: 250,
    });
    const p = decodePayout(data);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.value.kind).toBe("gift");
    expect(p.value.runId).toBeNull();
    expect(p.value.recipient).toBeNull();
    expect(p.value.claimant).toBe(claimant.toBase58());
    expect(p.value.releaseId).toBe("02".repeat(16));
    expect(p.value.declaredUsdc).toBe(5_000_000n);
  });
});

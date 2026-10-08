// @vitest-environment node
import { describe, expect, it } from "vitest";
import { wroteReceipt, writerAmong } from "@/lib/book/read-receipt";
import { type SignatureSource, cursorAfter, signaturesSince } from "./indexer";

/** A program's history, newest first, served the way getSignaturesForAddress serves it. */
function history(n: number) {
  const chain = Array.from({ length: n }, (_, i) => ({ signature: `s${n - i}`, slot: n - i, err: null }));
  const source: SignatureSource = async ({ before, until, limit }) => {
    const start = before ? chain.findIndex((e) => e.signature === before) + 1 : 0;
    const end = until ? chain.findIndex((e) => e.signature === until) : chain.length;
    return chain.slice(start, Math.min(end, start + limit));
  };
  return source;
}

describe("the indexer never passes a receipt over", () => {
  it("lists every signature since the cursor, across as many pages as it takes", async () => {
    const listed = await signaturesSince(history(3000), "s600", 1000);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toHaveLength(2400);
    expect(listed.value[0]!.signature).toBe("s3000");
    expect(listed.value[2399]!.signature).toBe("s601");
  });

  it("holds rather than leave a gap when the listing cannot reach the cursor", async () => {
    const listed = await signaturesSince(history(3000), "s600", 1000, 2);
    expect(listed.ok).toBe(false);
  });

  it("moves the cursor behind finished work only, never past something unfinished", () => {
    const [a, b, c, d] = ["a", "b", "c", "d"];
    expect(cursorAfter([a, b, c, d], new Set([a, b, d]))).toBe(b);
    expect(cursorAfter([a, b, c, d], new Set([a, b, c, d]))).toBe(d);
    expect(cursorAfter([a, b, c, d], new Set([b, c, d]))).toBeNull();
  });
});

describe("a receipt is filed under the transaction that wrote it", () => {
  const RENT = 2_519_680;

  it("knows the writer by the receipt's own slot and an account that was empty before it", () => {
    expect(wroteReceipt(100, 100n, 0)).toBe(true);
    expect(wroteReceipt(100, 100n, undefined)).toBe(true);
    // A match in the same slot found the account already holding its rent.
    expect(wroteReceipt(100, 100n, RENT)).toBe(false);
    // A measurement seven days on, and a match minutes on.
    expect(wroteReceipt(1_612_900, 100n, RENT)).toBe(false);
    expect(wroteReceipt(140, 100n, RENT)).toBe(false);
  });

  it("finds the writer in the account's history: the earliest that landed in that slot", () => {
    const newestFirst = [
      { signature: "measured30", slot: 6_600_100, err: null },
      { signature: "measured7", slot: 1_512_100, err: null },
      { signature: "matched", slot: 140, err: null },
      { signature: "sameSlotMatch", slot: 100, err: null },
      { signature: "wrote", slot: 100, err: null },
      { signature: "refused", slot: 100, err: { InstructionError: [2, { Custom: 6000 }] } },
    ];
    expect(writerAmong(newestFirst, 100n)).toBe("wrote");
    expect(writerAmong(newestFirst, 99n)).toBeNull();
  });
});

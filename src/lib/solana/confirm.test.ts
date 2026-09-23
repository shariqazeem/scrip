// @vitest-environment node
import type { Connection } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import { confirmSignature } from "./confirm";

vi.useFakeTimers();

/** A connection whose signature is unseen for `unseen` polls, then confirmed. */
function fakeConn(unseen: number) {
  let polls = 0;
  return {
    getSignatureStatuses: vi.fn(async () => {
      polls += 1;
      return { value: [polls > unseen ? { err: null, confirmationStatus: "confirmed" } : null] };
    }),
    getBlockHeight: vi.fn(async () => 100),
  } as unknown as Connection;
}

describe("confirmSignature", () => {
  it("re-broadcasts while the signature is unseen, and stops once it is seen", async () => {
    const resend = vi.fn(async () => "sig");
    const p = confirmSignature(fakeConn(3), "sig", 1_000, "confirmed", resend);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true, value: "sig" });
    expect(resend).toHaveBeenCalledTimes(3);
  });

  it("never re-broadcasts when not asked to", async () => {
    const p = confirmSignature(fakeConn(2), "sig", 1_000);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true, value: "sig" });
  });

  it("gives up when the blockhash expires, resend or not", async () => {
    const conn = { getSignatureStatuses: vi.fn(async () => ({ value: [null] })), getBlockHeight: vi.fn(async () => 2_000) } as unknown as Connection;
    const resend = vi.fn(async () => "sig");
    const p = confirmSignature(conn, "sig", 1_000, "confirmed", resend);
    await vi.runAllTimersAsync();
    const out = await p;
    expect(out.ok).toBe(false);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it("a resend that throws is not a failure of the confirmation", async () => {
    const p = confirmSignature(fakeConn(1), "sig", 1_000, "confirmed", async () => {
      throw new Error("429");
    });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true, value: "sig" });
  });
});

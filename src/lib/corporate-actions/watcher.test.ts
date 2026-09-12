import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Asset } from "@/lib/assets/registry";
import { assetBySymbol } from "@/lib/assets/registry";
import { db } from "@/lib/db";
import { books, multipliers, positions } from "@/lib/db/schema";
import { newId } from "@/lib/db/keys";
import type { Outcome } from "@/lib/outcome";
import { ok } from "@/lib/outcome";
import type { MintRead } from "./read-mint";
import { type MintReader, lastRecorded, runWatcher } from "./watcher";

const SPY = assetBySymbol("SPYx")!;
const T0 = 1_781_755_200; // the real SPYx activation stamp, 2026-06-18T04:00:00Z

/** A reader that hands the watcher an exact multiplier pair, with no network in the loop. */
function reader(
  multiplier: string,
  newMultiplier: string,
  effectiveAt: number,
): MintReader {
  return async (asset: Asset, now: number): Promise<Outcome<MintRead>> =>
    ok({
      kind: "scaled",
      snapshot: { mint: asset.mint, multiplier, newMultiplier, effectiveAt, seenAt: now },
    });
}

async function seedPosition(qtyRaw: bigint, qtyAdjusted: bigint, atEntry: string) {
  const bookId = newId("bk");
  await db.insert(books).values({
    id: bookId,
    owner: `owner-${bookId}`,
    pda: `pda-${bookId}`,
    policyJson: "{}",
    openedAt: T0,
  });
  const id = newId("pos");
  await db.insert(positions).values({
    id,
    bookId,
    mint: SPY.mint,
    qtyRaw: Number(qtyRaw),
    qtyAdjusted: Number(qtyAdjusted),
    costBasisBase: 10_000_000_000, // $10,000
    multiplierAtEntry: atEntry,
    updatedAt: T0,
  });
  return id;
}

const readBack = async (id: string) =>
  (await db.select().from(positions).where(eq(positions.id, id)))[0]!;

beforeEach(async () => {
  await db.delete(positions);
  await db.delete(multipliers);
  await db.delete(books);
});

describe("the watcher records what it sees", () => {
  it("records the live multiplier, not the field named multiplier", () => {
    // The whole bug, exercised end to end: the stale `multiplier` field is the obvious read
    // and the wrong one, because its replacement activated three months ago.
    return (async () => {
      const r = await runWatcher(reader("1.003909240011759", "1.005714560286254", T0), T0 + 60, [SPY]);
      expect(r.anyHeld).toBe(false);
      expect(r.assets[0]!.inForce).toBe("1.005714560286254");
      expect(r.assets[0]!.recorded).toBe(true);
      expect((await lastRecorded(SPY.mint))!.units).toBe(1005714560286254n);
    })();
  });

  it("records a pending change only once it has actually activated", async () => {
    const before = T0 - 3600;
    const r = await runWatcher(reader("1.0039", "1.0057", T0), before, [SPY]);
    expect(r.assets[0]!.inForce).toBe("1.0039");
    expect(r.assets[0]!.pending).toEqual({ value: "1.0057", effectiveAt: T0 });

    const rows = await db.select().from(multipliers);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBe("1.0039"); // the live one, not the announced one
  });

  it("does not re-record a value it has already seen", async () => {
    const read = reader("1.0039", "1.0057", T0);
    const first = await runWatcher(read, T0 + 60, [SPY]);
    const second = await runWatcher(read, T0 + 120, [SPY]);
    expect(first.assets[0]!.recorded).toBe(true);
    expect(second.assets[0]!.recorded).toBe(false);
    expect(await db.select().from(multipliers)).toHaveLength(1);
  });

  it("keeps the history rather than overwriting the latest value", async () => {
    // A reconciliation nobody can audit afterwards is indistinguishable from one we made up.
    await runWatcher(reader("1", "1.0039", T0), T0 + 60, [SPY]);
    await runWatcher(reader("1.0039", "1.0057", T0 + 86_400), T0 + 86_500, [SPY]);
    const rows = await db.select().from(multipliers);
    expect(rows.map((r) => r.value).sort()).toEqual(["1.0039", "1.0057"]);
  });

  it("holds when the same activation stamp comes back with a different value", async () => {
    await runWatcher(reader("1", "1.0039", T0), T0 + 60, [SPY]);
    const r = await runWatcher(reader("1", "9.9999", T0), T0 + 120, [SPY]);
    expect(r.anyHeld).toBe(true);
    expect(r.assets[0]!.heldWhy).toMatch(/was recorded as 1\.0039 and now reads 9\.9999/);
  });
});

describe("the watcher re-expresses positions", () => {
  it("runs a 4-for-1 split through to the stored quantity", async () => {
    const id = await seedPosition(100_00000000n, 100_00000000n, "1");
    const r = await runWatcher(reader("1", "4", T0), T0 + 60, [SPY]);
    expect(r.assets[0]!.reconciled).toBe(1);

    const row = await readBack(id);
    expect(row.qtyAdjusted).toBe(400_00000000); // ×4
    expect(row.qtyRaw).toBe(100_00000000); // the chain never moved
    expect(row.costBasisBase).toBe(10_000_000_000); // and neither did the dollars contributed
  });

  it("is idempotent — a second run moves nothing", async () => {
    const id = await seedPosition(100_00000000n, 100_00000000n, "1");
    await runWatcher(reader("1", "4", T0), T0 + 60, [SPY]);
    const afterFirst = await readBack(id);
    const second = await runWatcher(reader("1", "4", T0), T0 + 120, [SPY]);
    expect(second.assets[0]!.reconciled).toBe(0);
    expect((await readBack(id)).qtyAdjusted).toBe(afterFirst.qtyAdjusted);
  });

  it("re-expresses a position opened mid-cycle from its own entry multiplier", async () => {
    // 50 shares held at an entry multiplier of 1.0057 — raw is NOT 50, and an implementation
    // that re-expresses from the displayed quantity instead of from raw gets this wrong.
    const raw = 49_71600000n;
    const id = await seedPosition(raw, 50_00000000n, "1.005714560286254");
    await runWatcher(reader("1.005714560286254", "4.022858241145016", T0), T0 + 60, [SPY]);
    const row = await readBack(id);
    expect(row.qtyAdjusted / 1e8).toBeCloseTo(200, 2); // 4x, computed from raw
  });

  it("leaves a position alone when the multiplier has not moved", async () => {
    const id = await seedPosition(100_00000000n, 100_00000000n, "1");
    const r = await runWatcher(reader("1", "1", 0), T0 + 60, [SPY]);
    expect(r.assets[0]!.reconciled).toBe(0);
    expect((await readBack(id)).qtyAdjusted).toBe(100_00000000);
  });
});

describe("one asset holding does not stop the others", () => {
  it("reports the hold beside the assets that resolved", async () => {
    // An unreachable equity issuer must not freeze a book that also holds gold.
    const gold = assetBySymbol("GOLD")!;
    const mixed: MintReader = async (asset) =>
      asset.symbol === "SPYx"
        ? { ok: false, why: "SPYx: could not reach the chain (socket hang up)" }
        : ok({ kind: "unscaled", mint: asset.mint });

    const r = await runWatcher(mixed, T0 + 60, [SPY, gold]);
    expect(r.anyHeld).toBe(true);
    const spy = r.assets.find((a) => a.symbol === "SPYx")!;
    const g = r.assets.find((a) => a.symbol === "GOLD")!;
    expect(spy.heldWhy).toMatch(/could not reach the chain/);
    expect(spy.inForce).toBeNull();
    expect(g.heldWhy).toBeNull();
    expect(g.inForce).toBe("1"); // a plain SPL mint needs no adjustment
  });

  it("writes nothing at all for an asset that held", async () => {
    const id = await seedPosition(100_00000000n, 100_00000000n, "1");
    const bad: MintReader = async () => ({ ok: false, why: "rpc down" });
    await runWatcher(bad, T0 + 60, [SPY]);
    expect(await db.select().from(multipliers)).toHaveLength(0);
    expect((await readBack(id)).qtyAdjusted).toBe(100_00000000);
  });

  it("holds instead of reconciling against a stale snapshot", async () => {
    // A snapshot older than the maximum age is refused, so a dead watcher cannot have every
    // balance painted from a value nobody refreshed.
    const id = await seedPosition(100_00000000n, 100_00000000n, "1");
    const stale: MintReader = async (asset) =>
      ok({
        kind: "scaled",
        snapshot: {
          mint: asset.mint,
          multiplier: "1",
          newMultiplier: "4",
          effectiveAt: T0,
          seenAt: T0 - 7200, // two hours before "now"
        },
      });
    const r = await runWatcher(stale, T0, [SPY]);
    expect(r.anyHeld).toBe(true);
    expect(r.assets[0]!.heldWhy).toMatch(/minutes ago/);
    expect((await readBack(id)).qtyAdjusted).toBe(100_00000000);
  });
});

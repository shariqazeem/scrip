import { describe, expect, it } from "vitest";
import { eachAtMost, finishesWithin, standingBy } from "./pool";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("many saves at once", () => {
  it("runs every item, never more than the limit at a time", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    await eachAtMost(6, Array.from({ length: 50 }, (_, i) => i), async (i) => {
      running += 1;
      most = Math.max(most, running);
      await sleep(i % 3);
      done.push(i);
      running -= 1;
    });
    expect(done.sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(most).toBe(6);
  });

  it("copes with fewer items than workers, and with none", async () => {
    const seen: string[] = [];
    await eachAtMost(6, ["a", "b"], async (x) => void seen.push(x));
    expect(seen.sort()).toEqual(["a", "b"]);
    await eachAtMost(6, [], async () => undefined);
  });

  it("lets the round go on when one save is slow, without stopping it", async () => {
    let finished = false;
    const slow = sleep(80).then(() => {
      finished = true;
    });
    expect(await finishesWithin(slow, 20)).toBe(false);
    expect(await finishesWithin(sleep(1), 50)).toBe(true);
    await slow;
    expect(finished).toBe(true);
  });
});

describe("a backup service", () => {
  it("stands by for its patience, then steps in; with none set it acts at once", () => {
    expect(standingBy(90, 1_000, 1_030)).toBe(true);
    expect(standingBy(90, 1_000, 1_090)).toBe(false);
    expect(standingBy(0, 1_000, 1_000)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { offeredAssets } from "@/lib/assets/registry";
import { catalogue } from "@/lib/save/catalogue";
import { logoSource } from "./logo";
import { unframe } from "./unframe";

describe("logoSource", () => {
  it("has a logo for every stock a rule can save into, and gold", () => {
    for (const a of offeredAssets()) {
      const src = logoSource(a.mint);
      expect(src, a.symbol).not.toBeNull();
      expect(src!.url.startsWith("https://"), a.symbol).toBe(true);
    }
  });

  it("has a logo for every stock in the save picker", () => {
    const missing = catalogue().filter((s) => !logoSource(s.mint)).map((s) => s.symbol);
    expect(missing).toEqual([]);
  });

  it("marks xStocks' framed tiles and nothing else", () => {
    const qqq = offeredAssets().find((a) => a.symbol === "QQQx")!;
    expect(logoSource(qqq.mint)?.frame).toBe("xstocks");
    const gold = offeredAssets().find((a) => a.symbol === "GOLD")!;
    expect(logoSource(gold.mint)?.frame).toBeNull();
  });

  it("knows nothing of a mint Scrip does not offer", () => {
    expect(logoSource("11111111111111111111111111111111")).toBeNull();
  });
});

describe("unframe", () => {
  // A 100 px tile in xStocks' shape: one colour, a darker triangle at the middle of each edge.
  const W = 100;
  const BG = [120, 184, 8];
  const SHADE = [60, 92, 4];
  const WHITE = [255, 255, 255];
  function tile(): Uint8Array {
    const px = new Uint8Array(W * W * 4);
    const set = (x: number, y: number, c: number[]) => px.set([c[0]!, c[1]!, c[2]!, 255], (y * W + x) * 4);
    for (let y = 0; y < W; y += 1) for (let x = 0; x < W; x += 1) set(x, y, BG);
    for (let d = 0; d < 16; d += 1) {
      for (let k = 34 + d; k < 66 - d; k += 1) {
        set(k, d, SHADE);
        set(k, W - 1 - d, SHADE);
        set(d, k, SHADE);
        set(W - 1 - d, k, SHADE);
      }
    }
    // The logo: a block in the middle, and a stroke that reaches into the top triangle.
    for (let y = 40; y < 60; y += 1) for (let x = 40; x < 60; x += 1) set(x, y, WHITE);
    for (let y = 2; y < 40; y += 1) set(50, y, WHITE);
    return px;
  }
  const at = (px: Uint8Array, x: number, y: number) => Array.from(px.subarray((y * W + x) * 4, (y * W + x) * 4 + 3));

  it("paints the triangles in the background colour", () => {
    const px = tile();
    unframe(px, W, W);
    expect(at(px, 45, 3)).toEqual(BG);
    expect(at(px, 45, W - 4)).toEqual(BG);
    expect(at(px, 3, 45)).toEqual(BG);
    expect(at(px, W - 4, 45)).toEqual(BG);
  });

  it("leaves the logo alone, even where it crosses a triangle", () => {
    const px = tile();
    unframe(px, W, W);
    expect(at(px, 50, 5)).toEqual(WHITE);
    expect(at(px, 50, 50)).toEqual(WHITE);
  });

  it("does nothing to a tile with no frame", () => {
    const px = new Uint8Array(W * W * 4).fill(200);
    const before = Uint8Array.from(px);
    unframe(px, W, W);
    expect(px).toEqual(before);
  });
});

/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { deriveTokenBadgeAddress, validateConfigParameters } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { deriveTokenBadgeAddress as deriveDammBadge } from "@meteora-ag/cp-amm-sdk";
import { CURVE_STOCKS, DAMM_V2_PROGRAM_ID, DBC_PROGRAM_ID, PRESET, THRESHOLD, curveQuote, curveStockOfMint, feeBpsAt, scripCurveConfig, tokenBadge } from "./preset";
import { launchNameProblem } from "./names";
import { decodeMetadata } from "./launches";
import { configsOf } from "./deployed";

const PRICES_10_OCT: Record<string, number> = { QQQx: 752.17, SPYx: 778.9, TSLAx: 382.53, NVDAx: 230.01 };

describe("the Scrip Curve presets, priced in four stocks", () => {
  for (const stock of CURVE_STOCKS) {
    for (const kind of ["public", "demonstration"] as const) {
      it(`builds a ${kind} config in ${stock} that Meteora's own validator accepts`, () => {
        const c = scripCurveConfig(kind, stock);
        expect(() => validateConfigParameters({ ...c, leftoverReceiver: new PublicKey("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM") } as never)).not.toThrow();
        // Fees in the quote, so every claim is the stock, the one thing that stock's Plan pays.
        expect(c.collectFeeMode).toBe(0);
        expect(c.creatorTradingFeePercentage).toBe(PRESET.creatorTradingFeePercentage[kind]);
        // Migration at the threshold, in the stock's base units (8 decimals).
        expect(c.migrationQuoteThreshold.toString()).toBe(String(Math.round(THRESHOLD[kind][stock] * 10 ** curveQuote(stock).decimals)));
        // Everything locked at graduation: nobody can pull the pool.
        expect(c.partnerPermanentLockedLiquidityPercentage + c.creatorPermanentLockedLiquidityPercentage).toBe(100);
        expect(c.partnerLiquidityPercentage + c.creatorLiquidityPercentage).toBe(0);
      });
    }

    it(`graduates a public ${stock} curve above the $750 Meteora's keepers need, and a demonstration near $30`, () => {
      const p = PRICES_10_OCT[stock]!;
      expect(THRESHOLD.public[stock] * p).toBeGreaterThan(800);
      expect(THRESHOLD.public[stock] * p).toBeLessThan(900);
      expect(THRESHOLD.demonstration[stock] * p).toBeGreaterThan(25);
      expect(THRESHOLD.demonstration[stock] * p).toBeLessThan(35);
    });

    it(`knows ${stock} from the registry, Token-2022, 8 decimals, and back from its mint`, () => {
      const q = curveQuote(stock);
      expect(q.symbol).toBe(stock);
      expect(q.program).toBe("token-2022");
      expect(q.decimals).toBe(8);
      expect(curveStockOfMint(q.mint)).toBe(stock);
    });

    it(`derives Meteora's ${stock} token badges exactly as Meteora's SDKs do`, () => {
      const mint = new PublicKey(curveQuote(stock).mint);
      expect(tokenBadge(DBC_PROGRAM_ID, mint).toBase58()).toBe(deriveTokenBadgeAddress(mint).toBase58());
      expect(tokenBadge(DAMM_V2_PROGRAM_ID, mint).toBase58()).toBe(deriveDammBadge(mint).toBase58());
    });
  }

  it("gives a demonstration's whole partner-side fee to savers, none to whoever launched it", () => {
    expect(scripCurveConfig("demonstration").creatorTradingFeePercentage).toBe(0);
    expect(PRESET.migrationCreatorFeePercentage.demonstration).toBe(0);
  });

  it("falls from 25% to 1% over an hour, in sixty one-minute steps, and stays there", () => {
    expect(feeBpsAt(0)).toBe(2500);
    expect(feeBpsAt(59)).toBe(2500);
    expect(feeBpsAt(60)).toBeLessThan(2500);
    expect(feeBpsAt(1800)).toBeGreaterThan(100);
    expect(feeBpsAt(1800)).toBeLessThan(2500);
    expect(Math.round(feeBpsAt(3600))).toBe(100);
    expect(Math.round(feeBpsAt(86_400))).toBe(100);
    for (let t = 0; t < 3600; t += 60) expect(feeBpsAt(t + 60)).toBeLessThanOrEqual(feeBpsAt(t));
  });

  it("refuses a curve stock it does not have", () => {
    expect(curveStockOfMint("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")).toBeNull();
  });

  it("lists every config the record holds, flat", () => {
    for (const c of configsOf({ cluster: "x", feeClaimer: null, plans: {}, configs: { QQQx: { public: { address: "A", createdSig: "s" }, demonstration: { address: "B", createdSig: "s" } }, TSLAx: { public: { address: "C", createdSig: "s" } } }, launches: [] })) {
      expect(["A", "B", "C"]).toContain(c.address);
    }
  });
});

describe("what a launch may be called", () => {
  it("accepts a plain name and symbol", () => {
    expect(launchNameProblem("Savers' Club", "SAVE")).toBeNull();
    expect(launchNameProblem("Savings Demonstration One", "DEMO1")).toBeNull();
  });
  it("never calls a launch a Scrip token", () => {
    expect(launchNameProblem("Scrip Token", "SAVE")).not.toBeNull();
    expect(launchNameProblem("Savers", "SCRIP")).not.toBeNull();
  });
  it("never names a launch like a stock it could be mistaken for", () => {
    expect(launchNameProblem("Tesla Moon", "MOON")).not.toBeNull();
    expect(launchNameProblem("Nasdaq Club", "CLUB")).not.toBeNull();
    expect(launchNameProblem("Savers", "TSLA")).not.toBeNull();
    expect(launchNameProblem("Savers", "QQQX")).not.toBeNull();
    expect(launchNameProblem("Free shares", "FREE")).not.toBeNull();
  });
  it("keeps names short and plain", () => {
    expect(launchNameProblem("A", "AB")).not.toBeNull();
    expect(launchNameProblem("Name", "WAYTOOLONGSYM")).not.toBeNull();
    expect(launchNameProblem("Bad <script>", "BAD")).not.toBeNull();
    expect(launchNameProblem("Fine", "S-1")).not.toBeNull();
  });
});

describe("a token's Metaplex metadata", () => {
  it("decodes the name, symbol and uri, padding removed", () => {
    const str = (s: string, pad: number) => {
      const b = Buffer.alloc(4 + pad);
      b.writeUInt32LE(pad, 0);
      Buffer.from(s).copy(b, 4);
      return b;
    };
    const data = Buffer.concat([Buffer.from([4]), Buffer.alloc(64), str("Savers' Club", 32), str("SAVE", 10), str("https://scrip.work/api/curve/meta?n=x", 200)]);
    expect(decodeMetadata(data)).toEqual({ name: "Savers' Club", symbol: "SAVE", uri: "https://scrip.work/api/curve/meta?n=x" });
  });
  it("answers null for anything that is not metadata", () => {
    expect(decodeMetadata(Buffer.alloc(10))).toBeNull();
  });
});

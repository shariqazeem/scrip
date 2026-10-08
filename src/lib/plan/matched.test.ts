import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MATCHED_DISCRIMINATOR, MATCHED_LEN, decodeMatched, matchedFromLogs } from "./matched";

// The first Plan match on mainnet, 8 October 2026: transaction 33wcVSx4…3ug5r4, slot 454,450,036.
const LOGS = [
  "Program Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj invoke [1]",
  "Program data: 19d+sySvsgQzajUlJirVvrBh+jfP9/ZXWTZbwduRcSxP3QTIko7B8FWcowMe3Vz8EYk4EWKxaOidctEQr3bbg+zJqciLrgAdm+i4pgx3ZN9/St+jBQJXuGkkVB8CmiILUt1KkPGXZJLOGH0wFGxNcBwgFnYOQysyYq/cvULGaWomayIbkWsFnoCEHgAAAAAARQMEAAAAAACWleK5bqezhZ2p7SW3pGqSCnduL9rhmnvP3yshkjBFLShjhAQAAAAA+////6APAAAAAAAARinHagAAAABhKcdqAAAAAA==",
  "Program Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj consumed 48157 of 299700 compute units",
  "Program Fbp8fBdCnT8Pv1g5vJ8brPZm1U4yWLtUsEtoac8A16gj success",
];

describe("a match, read from its transaction's logs", () => {
  it("decodes the first mainnet match exactly", () => {
    const [m, ...rest] = matchedFromLogs(LOGS);
    expect(rest).toEqual([]);
    expect(m).toMatchObject({
      plan: "4ThiwbAjzsvFBXk6J7XkhoUUiy5uBp9S5h5ZECZY35q1",
      owner: "6mCBiCNNpaN8roM3HDJazNtceKEkTbWQzep71ae9fKDE",
      sponsor: "EsWeMEvuLDV2Q4CXigZbETzqXfEQwZntQjwD4Cy8AgY5",
      usdc: 2_000_000n, // $2: half of the $4 slice
    });
    // $2 priced at the Pyth read the match made: one unit fewer than half the save's 525,964.
    expect(m!.amountRaw).toBe(262_981n);
    expect(m!.expo).toBe(-5);
    expect(m!.at).toBeGreaterThanOrEqual(m!.publishTime);
  });

  it("names the receipt it matched, which the page looks it up by", () => {
    expect(matchedFromLogs(LOGS)[0]!.receipt).toBe("BVc1krVS4Lxb3rg4GqvhJabYJeMxpccfTMcUrNsp7AG9");
  });

  it("skips every other line and any event that is not a match", () => {
    const other = Buffer.from(new Uint8Array(MATCHED_LEN)).toString("base64");
    expect(matchedFromLogs(["Program log: hello", `Program data: ${other}`, "Program data: not base64 at all"])).toEqual([]);
    expect(matchedFromLogs(null)).toEqual([]);
  });

  it("refuses a truncated event", () => {
    const bytes = Uint8Array.from(Buffer.from(LOGS[1]!.slice("Program data: ".length), "base64"));
    expect(decodeMatched(bytes.subarray(0, MATCHED_LEN - 1))).toBeNull();
  });
});

describe("the layout is the IDL's", () => {
  const idl = JSON.parse(readFileSync(join(process.cwd(), "src/lib/anchor/scrip.json"), "utf8")) as {
    events: Array<{ name: string; discriminator: number[] }>;
    types: Array<{ name: string; type: { fields?: Array<{ name: string; type: unknown }> } }>;
  };

  it("has the IDL's discriminator", () => {
    expect([...MATCHED_DISCRIMINATOR]).toEqual(idl.events.find((e) => e.name === "Matched")!.discriminator);
  });

  it("reads the IDL's fields in the IDL's order and sizes", () => {
    const size = (t: unknown): number => {
      if (t === "pubkey") return 32;
      if (t === "u64" || t === "i64") return 8;
      if (t === "i32" || t === "u32") return 4;
      const arr = (t as { array?: [string, number] }).array;
      if (arr && arr[0] === "u8") return arr[1];
      throw new Error(`a field the decoder does not know: ${JSON.stringify(t)}`);
    };
    const fields = idl.types.find((t) => t.name === "Matched")!.type.fields!;
    expect(fields.map((f) => f.name)).toEqual(["plan", "owner", "receipt", "sponsor", "usdc", "amount_raw", "feed", "price", "expo", "conf", "publish_time", "at"]);
    expect(8 + fields.reduce((n, f) => n + size(f.type), 0)).toBe(MATCHED_LEN);
  });
});

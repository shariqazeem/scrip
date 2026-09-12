/**
 * @vitest-environment node
 *
 * NODE, NOT JSDOM, AND THIS IS A REAL BUG NOT A PREFERENCE. Account data comes back from the
 * RPC as a Node Buffer; under jsdom the global `Uint8Array` is a DIFFERENT constructor, so the
 * `instanceof` check inside the Token-2022 layout decoder fails and every Token-2022 mint
 * reports "b must be a Uint8Array". Measured here: GOLD and USDC (classic SPL, no extensions)
 * passed while SPYx, GLDx and SLVon all failed on the decode alone. The production path is
 * server-only and never meets jsdom; any test that decodes chain bytes must say so.
 */
import { Connection } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { ASSETS } from "./registry";
import { readMintMultiplier } from "@/lib/corporate-actions/read-mint";
import { multiplierInForce } from "@/lib/corporate-actions/multiplier";

/**
 * THE ANTI-DRIFT BATTERY — re-reads every registered mint from mainnet and checks the
 * registry still describes it.
 *
 * The registry is a set of claims about someone else's contracts, and an issuer can change
 * them without telling us: enable the transfer hook they reserved, flip the pause, add a
 * transfer fee, or migrate to a new mint. Any of those makes a row on `/assets` a false
 * statement, and the whole product rests on those rows being checkable.
 *
 *     npm run test:registry
 *
 * Gated on a flag so the ordinary suite stays offline and deterministic. A test that needs a
 * public RPC to pass is a test that fails on a train, and a suite that cries wolf is how a
 * real failure gets waved through.
 */
const LIVE = process.env.REGISTRY_LIVE === "1";
const rpc = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";

describe.runIf(LIVE)("the registry still matches mainnet", () => {
  const connection = new Connection(rpc, "confirmed");

  for (const asset of ASSETS) {
    it(`${asset.symbol} — mint, decimals and multiplier`, async () => {
      const now = Math.floor(Date.now() / 1000);
      const read = await readMintMultiplier(connection, asset, now);
      expect(read.ok, read.ok ? "" : read.why).toBe(true);
      if (!read.ok) return;

      if (asset.hasMultiplier) {
        expect(read.value.kind, `${asset.symbol} should carry a multiplier`).toBe("scaled");
        if (read.value.kind !== "scaled") return;
        // The value must resolve cleanly and sit inside the sanity band. An issuer publishing
        // something we would refuse is exactly what this battery is for.
        const live = multiplierInForce(read.value.snapshot, now);
        expect(live.ok, live.ok ? "" : live.why).toBe(true);
        if (live.ok) {
          console.log(
            `  ${asset.symbol}: in force ${live.value.raw}` +
              (live.value.pending
                ? ` · pending ${live.value.pending.raw} at ${new Date(live.value.pending.effectiveAt * 1000).toISOString()}`
                : ""),
          );
        }
      } else {
        expect(read.value.kind, `${asset.symbol} should carry no multiplier`).toBe("unscaled");
      }
    });
  }
});

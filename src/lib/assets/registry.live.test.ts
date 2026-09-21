/**
 * @vitest-environment node
 *
 * THE LIVE BATTERY. Reads every registered mint off MAINNET and checks the registry's claims
 * against the account itself: decimals, token program, freeze authority, and each issuer
 * power. Gated because it needs the network and the public RPC is slow.
 *
 *     npm run test:registry
 */
import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getPausableConfig,
  getPermanentDelegate,
  getScaledUiAmountConfig,
  getTransferFeeConfig,
  getTransferHook,
  unpackMint,
} from "@solana/spl-token";
import { describe, expect, it } from "vitest";
import { parsePriceAccount } from "@/lib/pyth/price";
import { ASSETS, PYTH_RECEIVER } from "./registry";

const LIVE = process.env.REGISTRY_LIVE === "1";
const RPC = process.env.MAINNET_RPC || "https://api.mainnet-beta.solana.com";

describe.skipIf(!LIVE)("every registry row matches its mint on mainnet", () => {
  const conn = new Connection(RPC, "confirmed");

  it("decimals, program, freeze authority and every issuer power", async () => {
    const infos = await conn.getMultipleAccountsInfo(ASSETS.map((a) => new PublicKey(a.mint)), "confirmed");
    ASSETS.forEach((a, i) => {
      const info = infos[i];
      expect(info, `${a.symbol} mint exists`).toBeTruthy();
      if (!info) return;
      const is22 = info.owner.equals(TOKEN_2022_PROGRAM_ID);
      expect(is22 ? "token-2022" : info.owner.equals(TOKEN_PROGRAM_ID) ? "spl-token" : "?", `${a.symbol} program`).toBe(a.program);
      const mint = unpackMint(new PublicKey(a.mint), info, info.owner);
      expect(mint.decimals, `${a.symbol} decimals`).toBe(a.decimals);
      expect(mint.freezeAuthority !== null, `${a.symbol} freeze authority`).toBe(a.powers.freezeAuthority);
      if (!is22) {
        expect(a.powers.permanentDelegate).toBe(false);
        expect(a.powers.hasMultiplier).toBe(false);
        return;
      }
      expect(getPermanentDelegate(mint) !== null, `${a.symbol} permanent delegate`).toBe(a.powers.permanentDelegate);
      expect(getPausableConfig(mint) !== null, `${a.symbol} pausable`).toBe(a.powers.pausable);
      expect(getScaledUiAmountConfig(mint) !== null, `${a.symbol} multiplier`).toBe(a.powers.hasMultiplier);
      expect(getTransferFeeConfig(mint) !== null, `${a.symbol} transfer fee`).toBe(a.powers.transferFee);
      const hook = getTransferHook(mint);
      const hookState = !hook ? "none" : hook.programId.equals(PublicKey.default) ? "reserved-disabled" : "active";
      expect(hookState, `${a.symbol} transfer hook`).toBe(a.powers.transferHook);
    });
  }, 60_000);

  it("every pinned price account is owned by the receiver and carries its feed", async () => {
    const pinned = ASSETS.flatMap((a) => [a.feedRaw, a.feedAdjusted]).filter((f): f is NonNullable<typeof f> => !!f && !!f.account);
    const infos = await conn.getMultipleAccountsInfo(pinned.map((f) => new PublicKey(f.account)), "confirmed");
    pinned.forEach((f, i) => {
      const info = infos[i];
      expect(info, `${f.label} exists`).toBeTruthy();
      if (!info) return;
      expect(info.owner.toBase58(), `${f.label} owner`).toBe(PYTH_RECEIVER);
      const p = parsePriceAccount(info.data);
      expect(p.ok && p.value.feedId, `${f.label} feed id`).toBe(f.feedId);
    });
  }, 60_000);
});

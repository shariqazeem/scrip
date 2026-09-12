"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, type StandardConnectFeature } from "@wallet-standard/features";
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
} from "@solana/wallet-standard-features";
import { Check, TriangleAlert } from "lucide-react";
import { ASSETS, type Asset } from "@/lib/assets/registry";
import { openBookIx, setPolicyIx } from "@/lib/book/instructions";
import { bps } from "@/lib/format";
import { TOTAL_BPS, type Policy, validatePolicy } from "@/lib/policy";

/**
 * SIGNING A MIX.
 *
 * The rule the whole product rests on is that weights come from a policy the owner signed —
 * so this is the only surface in Webgold where a weight is chosen, and the choosing is done
 * by a person, in a browser, with their own key. No operator, no model and no scheduled job
 * can reach this.
 *
 * The editor validates continuously against the SAME rules the program enforces, so the
 * button is disabled for exactly the reasons the chain would refuse — a person should never
 * pay a fee to be told their percentages do not add up.
 */
type Draft = { mint: string; bps: number };

const SLEEVES: readonly Asset[] = ASSETS.filter((a) => a.kind !== "cash");

export function PolicyEditor({
  owner,
  current,
  hasBook,
}: {
  owner: string;
  current: Policy;
  hasBook: boolean;
}) {
  const router = useRouter();
  const [legs, setLegs] = useState<Draft[]>(() =>
    SLEEVES.map((a) => ({
      mint: a.mint,
      bps: current.legs.find((l) => l.mint === a.mint)?.bps ?? 0,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const total = legs.reduce((n, l) => n + l.bps, 0);
  const policy: Policy = useMemo(
    () => ({ legs: legs.filter((l) => l.bps > 0), driftBps: current.driftBps }),
    [legs, current.driftBps],
  );
  const validity = validatePolicy(policy);
  const unchanged =
    JSON.stringify([...policy.legs].sort((a, b) => a.mint.localeCompare(b.mint))) ===
    JSON.stringify([...current.legs].sort((a, b) => a.mint.localeCompare(b.mint)));

  const sign = useCallback(async () => {
    setBusy(true);
    setWhy(null);
    setSignature(null);
    try {
      const prep = await fetch("/api/chain/prepare", { cache: "no-store" });
      if (!prep.ok) {
        setWhy(((await prep.json()) as { error?: string }).error ?? "Could not reach the chain.");
        return;
      }
      const chain = (await prep.json()) as {
        blockhash: string;
        cluster: string;
        clusterLabel: string;
        programDeployed: boolean;
      };
      if (!chain.programDeployed) {
        // Say it before the popup, not after the fee.
        setWhy(
          `The Webgold program is not deployed on ${chain.clusterLabel} yet, so a policy cannot be signed here. Nothing was sent and nothing was charged.`,
        );
        return;
      }

      const ownerKey = new PublicKey(owner);
      const built = hasBook ? setPolicyIx(ownerKey, policy) : openBookIx(ownerKey, policy);
      if (!built.ok) {
        setWhy(built.why);
        return;
      }

      const found = findWallet(owner);
      if (!found) {
        setWhy("The wallet that opened this book is not connected in this browser.");
        return;
      }

      const tx = new Transaction({ feePayer: ownerKey, recentBlockhash: chain.blockhash }).add(
        built.value,
      );
      const [result] = await found.wallet.features[SolanaSignAndSendTransaction].signAndSendTransaction(
        {
          account: found.account,
          chain: `solana:${chain.cluster === "mainnet-beta" ? "mainnet" : chain.cluster}` as `solana:${string}`,
          transaction: new Uint8Array(
            tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
          ),
        },
      );
      if (!result) {
        setWhy("The wallet returned no signature.");
        return;
      }
      setSignature(toBase58(result.signature));
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setWhy(/reject|denied|cancel|closed/i.test(msg) ? null : msg);
    } finally {
      setBusy(false);
    }
  }, [owner, policy, hasBook, router]);

  return (
    <div className="wg-editor">
      {legs.map((leg) => {
        const asset = SLEEVES.find((a) => a.mint === leg.mint)!;
        return (
          <label key={leg.mint} className="wg-editor-row">
            <span className="wg-editor-name">
              <span className={`wg-mix-dot is-${asset.kind}`} />
              {asset.name}
              <span className="wg-editor-sym">{asset.symbol}</span>
            </span>
            <input
              type="range"
              min={0}
              max={TOTAL_BPS}
              step={100}
              value={leg.bps}
              className="wg-editor-range"
              aria-label={`${asset.name} weight`}
              onChange={(e) =>
                setLegs((ls) =>
                  ls.map((l) => (l.mint === leg.mint ? { ...l, bps: Number(e.target.value) } : l)),
                )
              }
            />
            <span className="wg-editor-pct mono">{bps(leg.bps)}</span>
          </label>
        );
      })}

      <div className={`wg-editor-total${total === TOTAL_BPS ? " is-ok" : ""}`}>
        <span>Total</span>
        <span className="mono">{bps(total)}</span>
      </div>

      {!validity.ok ? (
        <p className="wg-editor-why">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {validity.why}
        </p>
      ) : null}
      {why ? (
        <p className="wg-editor-why is-error">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
      {signature ? (
        <p className="wg-editor-why is-ok">
          <Check size={14} strokeWidth={2} aria-hidden /> Signed. Your mix is on chain.
          <span className="mono"> {signature.slice(0, 10)}…</span>
        </p>
      ) : null}

      <button
        type="button"
        className="wg-action is-primary"
        disabled={busy || !validity.ok || (hasBook && unchanged)}
        onClick={() => void sign()}
      >
        {busy
          ? "Waiting for your wallet…"
          : hasBook
            ? unchanged
              ? "This is already your mix"
              : "Sign the new mix"
            : "Open this book"}
      </button>
      <p className="wg-doors-note">
        Your wallet will ask you to approve a transaction. It writes the policy and nothing
        else — Webgold never takes custody of an asset, and this instruction cannot move one.
      </p>
    </div>
  );
}

type Sendable = Wallet & {
  features: StandardConnectFeature & SolanaSignAndSendTransactionFeature;
};

function findWallet(owner: string): { wallet: Sendable; account: WalletAccount } | null {
  for (const w of getWallets().get()) {
    if (!(SolanaSignAndSendTransaction in w.features) || !(StandardConnect in w.features)) continue;
    const account = w.accounts.find((a) => a.address === owner);
    if (account) return { wallet: w as Sendable, account };
  }
  return null;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function toBase58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = B58[Number(n % 58n)]! + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

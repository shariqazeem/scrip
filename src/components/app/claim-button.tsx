"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey, Transaction } from "@solana/web3.js";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
} from "@solana/wallet-standard-features";
import { TriangleAlert } from "lucide-react";
import { assetByMint } from "@/lib/assets/registry";
import { claimPayoutIxs } from "@/lib/book/payout-instructions";

/**
 * TAKE A SPONSORED FIRST POSITION.
 *
 * The claimer signs, and in doing so becomes the recipient — the position was funded before
 * anybody knew who would take it. They pay rent for their own receipt, a few thousandths of a
 * SOL, which is what stops a sponsor being drained by account-creation spam.
 *
 * One per wallet per campaign, and nothing has to remember: the receipt's address is derived
 * from the release and the claimer, so a second attempt asks the runtime to create an account
 * that already exists.
 */
export function ClaimButton({
  owner,
  sponsor,
  nonce,
  releaseIdHex,
  legs,
}: {
  owner: string | null;
  sponsor: string;
  nonce: string;
  releaseIdHex: string;
  legs: ReadonlyArray<{ mint: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const claim = useCallback(async () => {
    if (!owner) return;
    setBusy(true);
    setWhy(null);
    try {
      const prep = await fetch("/api/chain/prepare", { cache: "no-store" });
      const chain = (await prep.json()) as {
        blockhash?: string;
        cluster?: string;
        clusterLabel?: string;
        programDeployed?: boolean;
        error?: string;
      };
      if (!prep.ok || !chain.blockhash) {
        setWhy(chain.error ?? "Could not reach the chain.");
        return;
      }
      if (!chain.programDeployed) {
        setWhy(`The Webgold program is not deployed on ${chain.clusterLabel} yet.`);
        return;
      }

      const built = claimPayoutIxs({
        claimer: new PublicKey(owner),
        sponsor: new PublicKey(sponsor),
        nonce: BigInt(nonce),
        releaseId: hexToBytes(releaseIdHex),
        legs: legs.map((l) => ({
          mint: l.mint,
          program: assetByMint(l.mint)?.program ?? "spl-token",
        })),
      });
      if (!built.ok) {
        setWhy(built.why);
        return;
      }

      const found = findWallet(owner);
      if (!found) {
        setWhy("The wallet that signed in is not connected in this browser.");
        return;
      }
      const tx = new Transaction({
        feePayer: new PublicKey(owner),
        recentBlockhash: chain.blockhash,
      }).add(...built.value.instructions);
      const [result] = await found.wallet.features[
        SolanaSignAndSendTransaction
      ].signAndSendTransaction({
        account: found.account,
        chain: `solana:${chain.cluster === "mainnet-beta" ? "mainnet" : chain.cluster}` as `solana:${string}`,
        transaction: new Uint8Array(
          tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
        ),
      });
      if (!result) {
        setWhy("The wallet returned no signature.");
        return;
      }
      router.push(`/receipt/${toBase58(result.signature)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "already in use" is what a second claim looks like from the runtime. Said plainly.
      if (/already in use|custom program error: 0x0/i.test(msg)) {
        setWhy("This wallet has already taken a position from this sponsor.");
      } else {
        setWhy(/reject|denied|cancel|closed/i.test(msg) ? null : msg);
      }
    } finally {
      setBusy(false);
    }
  }, [owner, sponsor, nonce, releaseIdHex, legs, router]);

  if (!owner) {
    return (
      <p className="wg-hint" style={{ margin: 0 }}>
        Sign in with the wallet that should hold it.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        className="wg-action is-primary"
        disabled={busy}
        onClick={() => void claim()}
      >
        {busy ? "Waiting for your wallet…" : "Take this position"}
      </button>
      {why ? (
        <p className="wg-editor-why is-error" style={{ marginTop: "var(--s-2)" }}>
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
    </>
  );
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

type Sendable = Wallet & { features: SolanaSignAndSendTransactionFeature };

function findWallet(owner: string): { wallet: Sendable; account: WalletAccount } | null {
  for (const w of getWallets().get()) {
    if (!(SolanaSignAndSendTransaction in w.features)) continue;
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

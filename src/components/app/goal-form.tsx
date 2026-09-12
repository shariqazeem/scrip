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
import { Check, TriangleAlert } from "lucide-react";
import { assetByMint } from "@/lib/assets/registry";
import { MAX_SKIM_BPS, setGoalIx, slugify, validateGoal, withdrawGoalIx } from "@/lib/book/goals";
import type { GoalWithHoldings } from "@/lib/book/read-goals";
import { bps, fromBase, short, usd } from "@/lib/format";

/**
 * SAVING AT THE MOMENT VALUE ARRIVES, which is the only version of saving that has ever
 * worked at scale.
 *
 * A goal takes a share of every inbound payout toward something named. The share is capped at
 * half by the program — a goal that takes everything is not saving, it is redirection — and
 * the vault can spend in exactly one direction, to its owner.
 */
export function GoalForm({ owner, goals }: { owner: string; goals: readonly GoalWithHoldings[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [skimPct, setSkimPct] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const send = useCallback(
    async (label: string, build: (payer: PublicKey) => ReturnType<typeof setGoalIx>) => {
      setBusy(label);
      setWhy(null);
      setDone(null);
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
          setWhy(
            `The Webgold program is not deployed on ${chain.clusterLabel} yet. Nothing was sent and nothing was charged.`,
          );
          return;
        }
        const payer = new PublicKey(owner);
        const ix = build(payer);
        if (!ix.ok) {
          setWhy(ix.why);
          return;
        }
        const found = findWallet(owner);
        if (!found) {
          setWhy("The wallet that signed in is not connected in this browser.");
          return;
        }
        const tx = new Transaction({ feePayer: payer, recentBlockhash: chain.blockhash }).add(
          ix.value,
        );
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
        setDone(label);
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setWhy(/reject|denied|cancel|closed/i.test(msg) ? null : msg);
      } finally {
        setBusy(null);
      }
    },
    [owner, router],
  );

  const draft = {
    slug: slugify(name),
    name: name.trim(),
    targetBase: BigInt(Math.round((Number(target) || 0) * 1e6)),
    skimBps: Math.round(skimPct * 100),
  };
  const validity = validateGoal(draft);

  return (
    <div className="wg-form">
      {goals.length > 0 ? (
        <div className="wg-goals">
          {goals.map((g) => {
            const legs = g.holdings
              .map((h) => ({ asset: assetByMint(h.mint), amount: h.amount }))
              .filter((l): l is { asset: NonNullable<typeof l.asset>; amount: bigint } => !!l.asset);
            return (
              <div key={g.address} className="wg-goal">
                <div className="wg-goal-head">
                  <span className="wg-goal-name">{g.name}</span>
                  <span className="mono">{bps(g.skimBps)} of every arrival</span>
                </div>
                <p className="wg-goal-holds">
                  {legs.length === 0
                    ? "Holding nothing yet. The skim applies to arrivals from here on, never to ones that already settled."
                    : legs
                        .map(
                          (l) =>
                            `${fromBase(l.amount, l.asset.decimals).toLocaleString("en-US", {
                              maximumFractionDigits: 6,
                            })} ${l.asset.symbol}`,
                        )
                        .join(" · ")}
                </p>
                <p className="wg-goal-meta mono">
                  toward {usd(fromBase(g.targetBase, 6))} · {short(g.address)}
                </p>
                <button
                  type="button"
                  className="wg-action"
                  disabled={busy !== null || legs.length === 0}
                  onClick={() =>
                    void send(`withdraw:${g.slug}`, (payer) => withdrawGoalIx(payer, g.slug, legs))
                  }
                >
                  {busy === `withdraw:${g.slug}` ? "Waiting for your wallet…" : "Take it out"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="wg-field">
        <label className="wg-label" htmlFor="goal-name">
          What are you saving for
        </label>
        <input
          id="goal-name"
          className="wg-input"
          placeholder="A laptop"
          maxLength={64}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="wg-field">
        <label className="wg-label" htmlFor="goal-target">
          How much it costs, in dollars
        </label>
        <input
          id="goal-target"
          className="wg-input is-mono"
          inputMode="decimal"
          placeholder="1500.00"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <p className="wg-hint">
          A target, never a limit. Nothing stops when you reach it and nothing is refused for
          going past it.
        </p>
      </div>

      <div className="wg-field">
        <label className="wg-label" htmlFor="goal-skim">
          Take {skimPct}% of every arrival
        </label>
        <input
          id="goal-skim"
          type="range"
          className="wg-editor-range"
          min={1}
          max={MAX_SKIM_BPS / 100}
          step={1}
          value={skimPct}
          onChange={(e) => setSkimPct(Number(e.target.value))}
        />
        <p className="wg-hint">
          Capped at {MAX_SKIM_BPS / 100}% by the program. A goal that takes everything is not
          saving, it is redirection.
        </p>
      </div>

      {!validity.ok && name !== "" ? (
        <p className="wg-editor-why">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {validity.why}
        </p>
      ) : null}
      {why ? (
        <p className="wg-editor-why is-error">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
      {done ? (
        <p className="wg-editor-why is-ok">
          <Check size={14} strokeWidth={2} aria-hidden /> Signed.
        </p>
      ) : null}

      <button
        type="button"
        className="wg-action is-primary"
        disabled={busy !== null || !validity.ok}
        onClick={() => void send("set", (payer) => setGoalIx(payer, draft))}
      >
        {busy === "set" ? "Waiting for your wallet…" : "Set this goal"}
      </button>
      <p className="wg-doors-note">
        A goal can pay one address and one only: yours. There is no instruction in the program
        that could send it anywhere else.
      </p>
    </div>
  );
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

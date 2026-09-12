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
import { ASSETS } from "@/lib/assets/registry";
import { fundPayoutIxs, releaseIdFrom, releasePayoutIxs } from "@/lib/book/payout-instructions";
import { bps, fromBase, grams, short, usd, usdAligned } from "@/lib/format";
import { type QuoteView, fromQuoteView } from "@/lib/pay/quote";

/**
 * FUND AND RELEASE — one form, one confirm, one receipt. No step wizard.
 *
 * The quote comes from the server because the weights come from the RECIPIENT's signed
 * policy, and a rule the browser could rewrite is not a rule. What the browser does is show
 * the payer exactly what will land — mint by mint, in grams — and turn it into a transaction
 * their own wallet signs.
 *
 * Funding and releasing go in ONE transaction. Two transactions would leave a window in which
 * value sits in an escrow nobody has been told about, and a payer whose second transaction
 * fails has a balance in limbo and no receipt to point at.
 */
const SLEEVES = ASSETS.filter((a) => a.kind !== "cash");
/** Only an asset with a pinned price feed can be sent by name — the receipt stamps a value. */
const NAMEABLE = ASSETS.filter((a) => a.price.account !== "");

export type PayMode = "payout" | "named";

export function PayForm({
  owner,
  initial,
}: {
  owner: string;
  initial?: { to?: string; amount?: string; reason?: string };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<PayMode>("payout");
  const [recipient, setRecipient] = useState(initial?.to ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const [giftMint, setGiftMint] = useState(NAMEABLE[0]?.mint ?? "");
  const [giftQty, setGiftQty] = useState("");
  const [constraint, setConstraint] = useState<string[]>([]);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [busy, setBusy] = useState<null | "quoting" | "signing">(null);
  const [why, setWhy] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const getQuote = useCallback(async () => {
    setBusy("quoting");
    setWhy(null);
    setQuote(null);
    setSignature(null);
    try {
      const res = await fetch("/api/pay/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "named"
            ? { recipient: recipient.trim(), mode: "named", mint: giftMint, quantity: Number(giftQty) }
            : {
                recipient: recipient.trim(),
                dollars: Number(amount),
                constraint: constraint.length > 0 ? constraint : null,
              },
        ),
      });
      const body = (await res.json()) as QuoteView & { error?: string };
      if (!res.ok) {
        setWhy(body.error ?? "That payout could not be quoted.");
        return;
      }
      setQuote(body);
    } catch (err) {
      setWhy(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [recipient, amount, constraint, mode, giftMint, giftQty]);

  const release = useCallback(async () => {
    if (!quote) return;
    setBusy("signing");
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
        setWhy(
          `The Webgold program is not deployed on ${chain.clusterLabel} yet, so this payout cannot settle here. Nothing was sent and nothing was charged.`,
        );
        return;
      }

      const allocation = fromQuoteView(quote);
      if (!allocation.ok) {
        setWhy(allocation.why);
        return;
      }

      const payer = new PublicKey(owner);
      const recipientKey = new PublicKey(quote.recipient);
      // The release id groups every payout in one campaign, so keep-rate is a query over a
      // cohort rather than a join nobody can reproduce.
      const releaseId = releaseIdFrom(`${owner}:${quote.recipient}:${Date.now()}`);

      const funded = fundPayoutIxs({
        payer,
        recipient: recipientKey,
        allocation: allocation.value,
        reason: reason.trim(),
        releaseId,
      });
      if (!funded.ok) {
        setWhy(funded.why);
        return;
      }
      const released = releasePayoutIxs({
        payer,
        recipient: recipientKey,
        allocation: allocation.value,
        nonce: funded.value.nonce,
        releaseId,
      });
      if (!released.ok) {
        setWhy(released.why);
        return;
      }

      const found = findWallet(owner);
      if (!found) {
        setWhy("The wallet that signed in is not connected in this browser.");
        return;
      }

      const tx = new Transaction({ feePayer: payer, recentBlockhash: chain.blockhash });
      tx.add(...funded.value.instructions, ...released.value.instructions);

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
      const sig = toBase58(result.signature);
      setSignature(sig);
      router.push(`/receipt/${sig}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setWhy(/reject|denied|cancel|closed/i.test(msg) ? null : msg);
    } finally {
      setBusy(null);
    }
  }, [quote, owner, reason, router]);

  const toggle = (mint: string) =>
    setConstraint((c) => (c.includes(mint) ? c.filter((m) => m !== mint) : [...c, mint]));

  const gift = NAMEABLE.find((a) => a.mint === giftMint);
  const ready =
    recipient.trim() !== "" &&
    (mode === "named" ? giftQty !== "" : amount !== "" && reason.trim() !== "");

  return (
    <div className="wg-form">
      <div className="wg-choices" role="group" aria-label="What kind of payment">
        <button
          type="button"
          className={`wg-choice${mode === "payout" ? " on" : ""}`}
          onClick={() => {
            setMode("payout");
            setQuote(null);
          }}
        >
          Release a payout
        </button>
        <button
          type="button"
          className={`wg-choice${mode === "named" ? " on" : ""}`}
          onClick={() => {
            setMode("named");
            setQuote(null);
          }}
        >
          Send a named slice
        </button>
      </div>

      <div className="wg-field">
        <label className="wg-label" htmlFor="recipient">
          {mode === "named" ? "Who it is for" : "Who is being paid"}
        </label>
        <input
          id="recipient"
          className="wg-input is-mono"
          placeholder="Their Solana address"
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setQuote(null);
          }}
          spellCheck={false}
          autoComplete="off"
        />
        <p className="wg-hint">
          They do not need an account, a book, or to have heard of Webgold. Value arrives in
          the wallet they already have.
        </p>
      </div>

      {mode === "payout" ? (
        <div className="wg-field">
          <label className="wg-label" htmlFor="amount">
            How much, in dollars of value
          </label>
          <input
            id="amount"
            className="wg-input is-mono"
            inputMode="decimal"
            placeholder="100.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setQuote(null);
            }}
          />
          <p className="wg-hint">
            A payout is denominated in dollars. What it becomes is their policy&rsquo;s
            decision, not yours.
          </p>
        </div>
      ) : (
        <div className="wg-field">
          <span className="wg-label">What, exactly</span>
          <div className="wg-choices">
            {NAMEABLE.map((a) => (
              <button
                key={a.mint}
                type="button"
                className={`wg-choice${giftMint === a.mint ? " on" : ""}`}
                onClick={() => {
                  setGiftMint(a.mint);
                  setQuote(null);
                }}
              >
                <span className={`wg-mix-dot is-${a.kind}`} />
                {a.symbol}
              </button>
            ))}
          </div>
          <input
            id="giftQty"
            className="wg-input is-mono"
            inputMode="decimal"
            placeholder={gift?.unit === "troy-ounce" ? "0.2000 oz" : "1.0000"}
            value={giftQty}
            onChange={(e) => {
              setGiftQty(e.target.value);
              setQuote(null);
            }}
          />
          <p className="wg-hint">
            A named gift stays named. Nought point two of an ounce arrives as nought point two
            of an ounce — their policy is never consulted, because nothing is left for it to
            decide.
          </p>
        </div>
      )}

      <div className="wg-field">
        <label className="wg-label" htmlFor="reason">
          What it is for
        </label>
        <input
          id="reason"
          className="wg-input"
          placeholder="Shipped the receipt page"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="wg-hint">
          This goes on the receipt, permanently, in your words. Webgold settles; it does not
          check whether the reason is true.
        </p>
      </div>

      {mode === "payout" ? (
      <div className="wg-field">
        <span className="wg-label">Restrict which assets it may become (optional)</span>
        <div className="wg-choices">
          {SLEEVES.map((a) => (
            <button
              key={a.mint}
              type="button"
              className={`wg-choice${constraint.includes(a.mint) ? " on" : ""}`}
              onClick={() => {
                toggle(a.mint);
                setQuote(null);
              }}
            >
              <span className={`wg-mix-dot is-${a.kind}`} />
              {a.symbol}
            </button>
          ))}
        </div>
        <p className="wg-hint">
          You may narrow the set. You may not set the proportions — those come from their
          signed policy, re-normalised across whatever you allow.
        </p>
      </div>
      ) : null}

      {why ? (
        <p className="wg-editor-why is-error">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}

      {quote ? <Quote quote={quote} /> : null}

      {signature ? (
        <p className="wg-editor-why is-ok">
          <Check size={14} strokeWidth={2} aria-hidden /> Settled.{" "}
          <span className="mono">{short(signature)}</span>
        </p>
      ) : null}

      {quote ? (
        <button
          type="button"
          className="wg-action is-primary"
          disabled={busy !== null}
          onClick={() => void release()}
        >
          {busy === "signing" ? "Waiting for your wallet…" : "Escrow and release"}
        </button>
      ) : (
        <button
          type="button"
          className="wg-action is-primary"
          disabled={busy !== null || !ready}
          onClick={() => void getQuote()}
        >
          {busy === "quoting" ? "Reading their policy…" : "See what will land"}
        </button>
      )}
    </div>
  );
}

function Quote({ quote }: { quote: QuoteView }) {
  const value = fromBase(BigInt(quote.valueBase), 6);
  const requested = fromBase(BigInt(quote.requestedBase), 6);
  // In base units, so a fraction of a cent is not rendered as "$0". Saying "$0 stays with
  // you" is worse than saying nothing: it reads as a bug, and the receipt records the exact
  // value that landed either way.
  const dustBase = BigInt(quote.requestedBase) - BigInt(quote.valueBase);
  const dustIsVisible = dustBase >= 10_000n; // one cent
  const gramsNow = Number(BigInt(quote.gramsE8)) / 1e8;

  return (
    <div className="wg-quote">
      <div className="wg-quote-head">
        <span>
          <strong>{short(quote.recipient)}</strong> receives
        </span>
        <span className="wg-quote-grams">
          {gramsNow > 0 ? grams(gramsNow) : usd(value)}
        </span>
      </div>
      {quote.legs.map((leg) => (
        <div key={leg.mint} className="wg-quote-leg">
          <span>
            {leg.name} <span className="wg-editor-sym">{leg.symbol}</span>
          </span>
          <span className="mono">{bps(leg.bps)}</span>
          <span className="mono">{usdAligned(fromBase(BigInt(leg.valueBase), 6))}</span>
        </div>
      ))}
      <p className="wg-quote-foot">
        {quote.policySource === "named"
          ? "Named, so nothing converted — their policy was not consulted."
          : quote.policySource === "signed"
            ? "Split by the policy they signed."
            : "They have not signed a policy, so this follows the default mix. If they sign one before you release, quote again."}{" "}
        {dustIsVisible
          ? `Token amounts round down, so ${usd(fromBase(dustBase, 6))} of the ${usd(requested)} stays with you rather than being claimed on a receipt.`
          : "Token amounts round down; the receipt records exactly what landed, never the round number."}
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keypair, Transaction } from "@solana/web3.js";
import { Check, TriangleAlert, Wallet as WalletIcon } from "lucide-react";
import { normalizeSlug, validateSlug } from "@/lib/handle";
import { type Sendable, connect, fromBase64, signAndSend, signOnly, solanaWallets, toBase64 } from "@/lib/wallet/client";
import { useTxToast } from "@/components/toast/use-tx-toast";

/**
 * CLAIM INTO YOUR WALLET. Connect, choose a handle if you have no book, sign. The relayer
 * paid the fee before you saw this; a link-based claim adds the claim key's signature here,
 * from the URL fragment that never left the browser.
 */
export function ClaimButton({
  payer,
  releaseId,
  recipient,
  needsClaimKey,
  asset,
  cluster,
  sponsored,
}: {
  payer: string;
  releaseId: string;
  recipient: string | null;
  needsClaimKey: boolean;
  asset: { symbol: string; decimals: number; xstocks: boolean };
  cluster: string;
  /** Whether the relayer could pay when the page rendered. The copy only; the route decides. */
  sponsored: boolean;
}) {
  const router = useRouter();
  const [wallets, setWallets] = useState<readonly Sendable[]>([]);
  const [slug, setSlug] = useState("");
  const [attest, setAttest] = useState(false);
  // Set after a sponsored send fails for want of the relayer's SOL: the next attempt skips the
  // relayer and is claimed at the claimer's own cost, rather than failing the same way twice.
  const [selfPay, setSelfPay] = useState(!sponsored);
  const [phase, setPhase] = useState<"idle" | "building" | "signing" | "sending" | "done">("idle");
  const [why, setWhy] = useState<string | null>(null);
  useTxToast(why ? "failed" : phase === "sending" ? "confirming" : phase, "Claim the share", { detail: why ?? undefined });
  const [secretOk, setSecretOk] = useState<boolean | null>(null);

  useEffect(() => {
    const refresh = () => setWallets(solanaWallets());
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!needsClaimKey) return;
    setSecretOk(claimKeypair() !== null);
  }, [needsClaimKey]);

  function claimKeypair(): Keypair | null {
    const frag = typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, "");
    if (!frag) return null;
    try {
      const bytes = fromBase64(frag.replace(/-/g, "+").replace(/_/g, "/"));
      if (bytes.length !== 32) return null;
      return Keypair.fromSeed(bytes);
    } catch {
      return null;
    }
  }

  async function claim(wallet: Sendable) {
    setWhy(null);
    setPhase("building");
    const account = await connect(wallet);
    if (!account.ok) {
      setPhase("idle");
      if (account.why) setWhy(account.why);
      return;
    }
    if (recipient && account.value.address !== recipient) {
      setPhase("idle");
      setWhy(`This position is for ${recipient.slice(0, 6)}…; the connected wallet is ${account.value.address.slice(0, 6)}….`);
      return;
    }
    const key = needsClaimKey ? claimKeypair() : null;
    if (needsClaimKey && !key) {
      setPhase("idle");
      setWhy("This link is missing its claim secret. Ask for the full link, including the part after #.");
      return;
    }
    const chosen = slug || normalizeSlug(account.value.address).slice(0, 12);
    // The same parameters go to both routes: /api/claim/tx builds the claim from them, and
    // /api/relay rebuilds it from them to check nothing changed before the relayer co-signs.
    const params = { claimer: account.value.address, payer, releaseId, claimKey: key?.publicKey.toBase58() ?? null, slug: chosen, termsVersion: attest ? 1 : 0 };
    const res = await fetch("/api/claim/tx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...params, mode: selfPay ? "self" : undefined }),
    });
    const built = (await res.json()) as { transactionBase64?: string; error?: string; opensBook?: boolean; mode?: "sponsored" | "self" };
    if (!res.ok || !built.transactionBase64) {
      setPhase("idle");
      setWhy(built.error ?? "The claim could not be built.");
      return;
    }
    setPhase("signing");
    // Self-paid and addressed to this wallet: one signer, who also pays. Phantom signs AND sends
    // it itself — the path it prefers, with nothing of ours in between.
    if (built.mode === "self" && !key) {
      const sent = await signAndSend(wallet, account.value, fromBase64(built.transactionBase64), cluster);
      if (!sent.ok) {
        setPhase("idle");
        if (sent.why) setWhy(sent.why);
        return;
      }
      setPhase("done");
      setTimeout(() => router.push(`/receipt/${sent.value}`), 2000);
      return;
    }
    const signed = await signOnly(wallet, account.value, fromBase64(built.transactionBase64), cluster);
    if (!signed.ok) {
      setPhase("idle");
      if (signed.why) setWhy(signed.why);
      return;
    }
    // The wallet signed first, which is what Phantom requires; the claim key signs after it,
    // over whatever the wallet returned (Phantom may have added Lighthouse assertions). The
    // relayer has not signed yet — it signs last, on the server, after checking the claim —
    // so its signature is still missing here, and that is expected.
    let bytes = signed.value;
    if (key) {
      const tx = Transaction.from(bytes);
      tx.partialSign(key);
      bytes = new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
    }
    setPhase("sending");
    // Self-paid with a link's claim key: every signer is on it now, so it goes straight out.
    // Sponsored: the relayer checks it is still the claim it built, then co-signs and sends.
    const relay =
      built.mode === "self"
        ? await fetch("/api/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionBase64: toBase64(bytes) }) })
        : await fetch("/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionBase64: toBase64(bytes), claim: params }) });
    const out = (await relay.json()) as { signature?: string; error?: string };
    if (!relay.ok || !out.signature) {
      setPhase("idle");
      if (built.mode !== "self" && /insufficient|prior credit|rent/i.test(out.error ?? "")) {
        // The relayer ran dry between building and sending. Nothing moved; the next attempt
        // is claimed at the claimer's own cost instead of failing the same way twice.
        setSelfPay(true);
        setWhy("The sponsor ran out of SOL a moment ago. Nothing moved. Claim again and it will be claimed at your own cost — under 0.009 SOL.");
        return;
      }
      setWhy(out.error ?? "The claim was refused. Nothing moved.");
      return;
    }
    setPhase("done");
    setTimeout(() => router.push(`/receipt/${out.signature}`), 2000);
  }

  const slugCheck = slug ? validateSlug(slug) : null;

  return (
    <div className="sp-form" style={{ maxWidth: 480 }}>
      <div className="sp-field">
        <label className="sp-label" htmlFor="slug">
          Your handle <span style={{ color: "var(--ink-faint)", fontWeight: 400 }}>(if you have no register yet)</span>
        </label>
        <input id="slug" className="sp-input is-mono" placeholder="shariq" value={slug} onChange={(e) => setSlug(normalizeSlug(e.target.value))} />
        <p className="sp-hint">Becomes your pay link: /pay/{slug || "yourname"}. Leave it blank for one made from your address.</p>
        {slugCheck && !slugCheck.ok ? <p className="sp-why">{slugCheck.why}</p> : null}
      </div>
      {asset.xstocks ? (
        <label className="sp-check">
          <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
          <span>
            I am not a US person, and I understand {asset.symbol} is a tracker certificate issued by Backed whose issuer can freeze and move
            it, and that dividends are reinvested, not paid.
          </span>
        </label>
      ) : null}
      {needsClaimKey && secretOk === false ? (
        <p className="sp-why is-err">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> This link is missing its claim secret (the part after #).
        </p>
      ) : null}
      <div className="sp-actions">
        {wallets.length === 0 ? (
          <p className="sp-doors-note">No Solana wallet is installed in this browser. Install Phantom, Solflare or Backpack, or open this link in a wallet&rsquo;s browser.</p>
        ) : (
          wallets.map((w) => (
            <button
              key={w.name}
              type="button"
              className="sp-action is-primary"
              disabled={phase !== "idle" || (asset.xstocks && !attest) || (slugCheck !== null && !slugCheck.ok)}
              onClick={() => void claim(w)}
            >
              {w.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={w.icon} alt="" width={16} height={16} style={{ borderRadius: 4 }} />
              ) : (
                <WalletIcon size={16} strokeWidth={2} aria-hidden />
              )}
              {phase === "building" ? "Building…" : phase === "signing" ? `Waiting for ${w.name}…` : phase === "sending" ? "Claiming…" : phase === "done" ? "Claimed" : `Claim into your wallet with ${w.name}`}
            </button>
          ))
        )}
      </div>
      {why ? (
        <p className="sp-why is-err">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden /> {why}
        </p>
      ) : null}
      {phase === "done" ? (
        <p className="sp-why is-ok">
          <Check size={14} strokeWidth={2} aria-hidden /> Claimed. Opening your receipt.
        </p>
      ) : null}
      <p className="sp-doors-note">
        {selfPay
          ? "Your wallet will ask you to approve under 0.009 SOL: the fee, and the rent for your new register and its receipt. The register's rent comes back if you ever close it. The signature moves the escrow into your own token account and nowhere else."
          : "Your wallet will ask you to sign, not to pay: the fee and the rent are covered. The signature moves the escrow into your own token account and nowhere else."}
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { ScripMark } from "@/components/brand/scrip-mark";
import { PayForm } from "@/components/pay/pay-form";
import { PayModes } from "@/components/pay/pay-modes";
import { SendUsdc } from "@/components/pay/send-usdc";
import { defaultAsset } from "@/lib/assets/registry";
import { resolveAsset } from "@/lib/assets/stand-in";
import { MIN_SLICE } from "@/lib/rule/slice";
import { readBookOf, resolveHandle } from "@/lib/book/read-book";
import { validateSlug } from "@/lib/handle";
import { short } from "@/lib/format";
import { cluster } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import { siteUrl } from "@/lib/site";
import "../pay.css";
import "@/styles/app.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }>; searchParams: Promise<{ amount?: string; reason?: string; in?: string }> };

/**
 * THE PAY LINK — the intake, for a payer with no account.
 *
 * "Pay @shariq. Lands as SPYx in their own wallet, with a receipt." A handle resolves to an
 * owner; an address works too. An address with no Book renders in sponsor mode: the swap's
 * output waits in escrow until the recipient claims it, opening a Book on the way.
 */
async function resolve(raw: string): Promise<{ owner: string | null; handle: string | null; isAddress: boolean; why: string | null }> {
  const slug = validateSlug(raw);
  if (slug.ok) {
    const owner = await resolveHandle(slug.value);
    if (!owner.ok) return { owner: null, handle: slug.value, isAddress: false, why: owner.why };
    return { owner: owner.value, handle: slug.value, isAddress: false, why: null };
  }
  try {
    const key = new PublicKey(raw);
    if (!PublicKey.isOnCurve(key.toBytes())) return { owner: null, handle: null, isAddress: true, why: "That address is a program account; nobody could spend what lands there." };
    return { owner: key.toBase58(), handle: null, isAddress: true, why: null };
  } catch {
    return { owner: null, handle: null, isAddress: false, why: "That is neither a handle nor a Solana address." };
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const r = await resolve(handle);
  const who = r.handle ? `@${r.handle}` : r.owner ? short(r.owner) : handle;
  return { title: `Pay ${who} in stock`, description: `Pay ${who}. It lands as stock in their own wallet, with a receipt anyone can open.` };
}

export default async function PayPage({ params, searchParams }: Params) {
  const { handle } = await params;
  const q = await searchParams;
  const r = await resolve(handle);

  const book = r.owner ? await readBookOf(connection(), new PublicKey(r.owner)) : null;
  const hasBook = !!book?.ok && !!book.value;
  const asset = hasBook && book?.ok && book.value ? await resolveAsset(book.value.asset) : defaultAsset();
  const rule = hasBook && book?.ok && book.value && book.value.rule.enabled ? book.value.rule : null;
  const standIn = !!asset && asset.symbol === "stand-in";
  const ownerHandle = hasBook && book?.ok && book.value ? book.value.slug : r.handle;
  const who = ownerHandle ? `@${ownerHandle}` : r.owner ? short(r.owner) : handle;
  const site = siteUrl();
  const prefillAmount = Number(q.amount ?? "");
  const prefillReason = typeof q.reason === "string" ? q.reason.slice(0, 200) : "";

  return (
    <main className="sp-pay">
      <div className="sp-pay-col">
        <div className="sp-pay-top">
          <Link href="/" className="sp-pay-brand" aria-label="Scrip">
            <ScripMark size={20} />
            Scrip
          </Link>
          <span className="mono">{cluster() === "mainnet-beta" ? "Solana" : cluster()}</span>
        </div>

        {r.why || !r.owner ? (
          <>
            <h1 className="sp-pay-h1">{r.handle ? `Nobody has @${r.handle} yet.` : "That link does not resolve."}</h1>
            <p className="sp-pay-lede">
              {r.why ?? "A handle is three to twenty-four lowercase letters and digits, and somebody has to have opened a book with it."}
            </p>
            {r.handle && !r.why ? (
              <p className="sp-pay-lede">
                If it is yours, <Link href="/app/rule">open a book</Link> and take it.
              </p>
            ) : null}
          </>
        ) : !asset ? (
          <>
            <h1 className="sp-pay-h1">This book&rsquo;s asset is not on the registry.</h1>
            <p className="sp-pay-lede">Nothing can be quoted for it here.</p>
          </>
        ) : (
          <>
            <h1 className="sp-pay-h1">Pay {who}.</h1>
            <p className="sp-pay-lede">
              {hasBook ? (
                <>
                  In stock: you send USDC and {asset.symbol} lands in their own wallet, with your reason on a receipt. In USDC: a normal transfer to their
                  address{rule ? `, and their rule turns ${rule.rateBps / 100}% of it into ${asset.symbol}` : ""}. You never hold a stock either way.
                </>
              ) : (
                <>
                  This address has no Scrip book yet, so your payment becomes {asset.symbol} and waits in escrow. They claim it into their
                  own wallet with one tap, from an empty wallet, and a receipt is written then.
                </>
              )}
            </p>
            {(() => {
              const form = (
                <PayForm
                  owner={r.owner}
                  who={who}
                  asset={{ symbol: asset.symbol, name: asset.name, decimals: asset.decimals, mint: asset.mint, issuer: asset.issuer.name, singleName: asset.singleName }}
                  solanaPayBase={ownerHandle ? `${site}/api/solana-pay/${ownerHandle}` : null}
                  cluster={cluster()}
                  prefill={{ amount: Number.isFinite(prefillAmount) && prefillAmount > 0 ? prefillAmount : null, reason: prefillReason }}
                />
              );
              if (!hasBook || !book?.ok || !book.value) return form;
              const minUsd = rule ? Math.max(1, Math.ceil(Number(MIN_SLICE) / 1e6 / (rule.rateBps / 10_000))) : 1;
              return (
                <PayModes
                  initial={q.in === "usdc" ? "usdc" : "stock"}
                  who={who}
                  assetSymbol={asset.symbol}
                  rateOn={rule !== null}
                  stock={form}
                  usdc={<SendUsdc owner={r.owner} who={who} usdcMint={book.value.usdcMint} rateBps={rule?.rateBps ?? null} assetSymbol={asset.symbol} standIn={standIn} minUsd={minUsd} />}
                />
              );
            })()}
          </>
        )}
      </div>
    </main>
  );
}

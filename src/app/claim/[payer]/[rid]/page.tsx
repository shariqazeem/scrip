import type { Metadata } from "next";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { ScripMark } from "@/components/brand/scrip-mark";
import { ClaimButton } from "@/components/claim/claim-button";
import { readBookOf } from "@/lib/book/read-book";
import { readPayout } from "@/lib/book/read-payout";
import { short, unitsFromRaw, usdc } from "@/lib/format";
import { cluster } from "@/lib/solana/cluster";
import { connection } from "@/lib/solana/connection";
import { CLAIM_MIN_BALANCE_LAMPORTS } from "@/lib/claim/build";
import { relayerKeypair } from "@/lib/relayer";
import "../../../pay/pay.css";
import "@/styles/app.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ payer: string; rid: string }> };

export const metadata: Metadata = { title: "Claim into your wallet" };

/**
 * A SPONSORED POSITION, WAITING. "0.2617 SPYx is waiting for you, from @shariq." One action:
 * claim into your wallet. Fee-sponsored. The claim secret, when there is one, stays in the
 * URL fragment and never reaches this server.
 */
export default async function ClaimPage({ params }: Params) {
  const { payer, rid } = await params;
  const p = await readPayout(payer, rid);
  // Whether the relayer can pay for this claim right now — so the page says "the fee is
  // covered" only when it is. The route decides again at the moment of claiming; this only
  // keeps the words honest before anyone clicks.
  const relayer = relayerKeypair();
  const sponsored = relayer
    ? await connection()
        .getBalance(relayer.publicKey, "confirmed")
        .then((l) => l >= CLAIM_MIN_BALANCE_LAMPORTS)
        .catch(() => true)
    : false;
  const sponsorBook = (() => {
    try {
      return readBookOf(connection(), new PublicKey(payer));
    } catch {
      return null;
    }
  })();
  const sponsor = sponsorBook ? await sponsorBook : null;
  const from = sponsor && sponsor.ok && sponsor.value ? `@${sponsor.value.slug}` : short(payer);

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

        {!p.ok ? (
          <>
            <h1 className="sp-pay-h1">This claim could not be read.</h1>
            <p className="sp-pay-lede">{p.why}</p>
          </>
        ) : !p.value ? (
          <>
            <h1 className="sp-pay-h1">Nothing is waiting here.</h1>
            <p className="sp-pay-lede">This position was already claimed, taken back after thirty days, or never funded.</p>
          </>
        ) : !p.value.asset_ ? (
          <>
            <h1 className="sp-pay-h1">The sponsored asset is not on the registry.</h1>
          </>
        ) : (
          <>
            <h1 className="sp-pay-h1">
              {unitsFromRaw(p.value.escrowRaw, p.value.asset_.decimals)} {p.value.asset_.symbol} is waiting for you, from {from}.
            </h1>
            <p className="sp-pay-lede">
              {usdc(p.value.declaredUsdc)} was paid for it. Claim it into your own wallet:{" "}
              {sponsored ? "the fee is covered, " : ""}a register opens for you on the way if you have none, and a receipt is written that anyone
              can open. Nothing about this asks you to decide to invest; it already happened.
            </p>
            <ClaimButton
              payer={payer}
              releaseId={rid}
              recipient={p.value.recipient}
              needsClaimKey={p.value.recipient === null}
              asset={{ symbol: p.value.asset_.symbol, decimals: p.value.asset_.decimals, xstocks: p.value.asset_.issuer.name.includes("xStocks") }}
              cluster={cluster()}
              sponsored={sponsored}
            />
            <p className="sp-pay-note">
              {p.value.asset_.name}, issued by {p.value.asset_.issuer.name}. {p.value.asset_.disclosure}
            </p>
          </>
        )}
      </div>
    </main>
  );
}

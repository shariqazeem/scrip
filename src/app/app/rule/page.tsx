import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { PageFrame } from "@/components/app/page-frame";
import { RuleEditor } from "@/components/app/rule-editor";
import { SignOut } from "@/components/auth/connect";
import { offeredAssets, ruleAssets } from "@/lib/assets/registry";
import { loadBook } from "@/lib/book/read-book";
import { currentOwner } from "@/lib/session/server";
import { prices as jupPrices } from "@/lib/jupiter/client";
import { solUsd } from "@/lib/market";
import { stockByMint } from "@/lib/save/catalogue";

export const metadata: Metadata = { title: "Save every payment" };
export const dynamic = "force-dynamic";

/**
 * THE RULE — turn on, change, pause. "Choose the share of your income you never want to
 * think about again." Rate as three large presets and a slider to 50%; asset; optional
 * floor and cap; escalation as one checkbox; the allowance with a plain explanation of what
 * the delegate can and cannot do; the float with "about N sweeps". One signature.
 */
export default async function RulePage({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  const owner = await currentOwner();
  // "Do this with every payment", from a save's receipt: the stock that save bought, when the
  // chain can price it for an automatic save.
  const initialAsset = (await searchParams).asset ?? null;
  // Only what a keeper can price on chain today: a rule on anything else could only wait.
  const assets = offeredAssets();

  // Jupiter's display price, so the worked example shows real units for the rate the person
  // is choosing. Display only — a sweep still settles against Pyth on chain, and the stub's
  // own foot says the figure is arithmetic. A price that cannot be read leaves the units out
  // rather than inventing one.
  //
  // Read BEFORE the signed-out branch, and passed to both. The signed-out page is the one a
  // stranger meets first, and it is the whole point of answering the question before asking
  // for a wallet — so it is the last page that should be missing the number.
  // Every offered stock, single companies too: "do this with every payment" often arrives
  // from a save into Nvidia, and its worked example deserves real units.
  const [p, solPrice] = await Promise.all([jupPrices(assets.map((a) => a.mint)).catch(() => null), solUsd().catch(() => null)]);
  const priceProps = p && p.ok ? Object.fromEntries(p.value) : {};

  if (!owner) {
    // The question first, the wallet second: choose a rate before anything asks for a signature.
    return (
      <PageFrame eyebrow="Every payment" title="Save part of every payment, by itself." sub="Say yes once. Whoever pays you keeps sending USDC to the address you already use, and a slice of every payment becomes stock in this same wallet as it lands, with a receipt.">
        <RuleEditor owner={null} view={null} assets={assets.map(opt)} prices={priceProps} solPrice={solPrice} initialAsset={initialAsset} />
      </PageFrame>
    );
  }
  const view = await loadBook(owner);
  return (
    <PageFrame
      eyebrow="Every payment"
      title="Save part of every payment, by itself."
      sub="Whoever pays you keeps sending USDC to this address, and a slice of every payment becomes stock in this same wallet as it lands, with a receipt."
      actions={<SignOut />}
    >
      {!view.ok ? (
        <div className="sp-held">
          <TriangleAlert size={16} strokeWidth={2} aria-hidden />
          <span>{view.why}</span>
        </div>
      ) : (
        <RuleEditor
          owner={owner}
          view={{
            hasBook: view.value.book !== null,
            slug: view.value.book?.slug ?? null,
            assetMint: view.value.asset?.mint ?? null,
            state: view.value.state,
            rule: view.value.book
              ? {
                  enabled: view.value.book.rule.enabled,
                  rateBps: view.value.book.rule.rateBps,
                  escalateBps: view.value.book.rule.escalateBps,
                  floorUsdc: view.value.book.rule.floorUsdc.toString(),
                  capUsdc: view.value.book.rule.capUsdc.toString(),
                  toleranceBps: view.value.book.rule.toleranceBps,
                }
              : null,
            usdcBalance: view.value.usdc.balance.toString(),
            usdcExists: view.value.usdc.exists,
            usdcAccountRentLamports: view.value.usdcAccountRentLamports.toString(),
            delegatedAmount: view.value.usdc.delegatedAmount.toString(),
            floatLamports: view.value.floatLamports.toString(),
            sweepsCovered: view.value.sweepsCovered,
            ownerLamports: view.value.ownerLamports.toString(),
            openCostLamports: view.value.openCostLamports.toString(),
          }}
          prices={priceProps}
          solPrice={solPrice}
          initialAsset={initialAsset}
          assets={[...assets, ...(view.value.asset && !assets.some((a) => a.mint === view.value.asset?.mint) ? [view.value.asset] : [])].map(opt)}
        />
      )}
    </PageFrame>
  );
}

function opt(a: ReturnType<typeof ruleAssets>[number]) {
  return { mint: a.mint, symbol: a.symbol, name: a.name, label: stockByMint(a.mint)?.name ?? a.name, singleName: a.singleName, xstocks: a.issuer.name.includes("xStocks"), issuer: a.issuer.name, kind: a.kind };
}

import type { Metadata } from "next";
import { PageFrame } from "@/components/app/page-frame";
import { ConnectWallet, SignOut } from "@/components/auth/connect";
import { PayOne } from "@/components/org/pay-one";
import { currentOwner } from "@/lib/session/server";
import { cluster } from "@/lib/solana/cluster";
import { siteUrl } from "@/lib/site";
import "@/components/org/org.css";
import "../../../pay/pay.css";

export const metadata: Metadata = { title: "Pay one" };
export const dynamic = "force-dynamic";

export default async function PayOnePage({ searchParams }: { searchParams: Promise<{ to?: string; amount?: string; reason?: string }> }) {
  const owner = await currentOwner();
  // A prefilled payment, from the Welcome-bonus page: who, how much, and the reason.
  const q = await searchParams;
  const prefill = { to: (q.to ?? "").slice(0, 64), amount: (q.amount ?? "").replace(/[^0-9.]/g, "").slice(0, 10), reason: (q.reason ?? "").slice(0, 200) };
  if (!owner) {
    return (
      <PageFrame eyebrow="Pay in stock" title="Pay one person in ownership." sub="Sign in with the wallet that pays.">
        <ConnectWallet />
      </PageFrame>
    );
  }
  return (
    <PageFrame eyebrow="Pay in stock" title="Pay one." sub="A handle or an address, an amount, the split, a reason. The stock lands in their own wallet with a receipt; the rest lands as USDC in the same transaction." actions={<SignOut />}>
      <PayOne owner={owner} cluster={cluster()} site={siteUrl()} prefill={prefill} />
    </PageFrame>
  );
}

import type { Metadata } from "next";
import { DocFrame } from "@/components/docs/doc-frame";

export const metadata: Metadata = { title: "What a keeper can and cannot do" };

export default function Page() {
  return (
    <DocFrame
      here="/docs/keepers"
      eyebrow="Docs"
      title="What a keeper can and cannot do."
      lede="Keepers are permissionless and open source. Anyone can run one; the tip pays them. Their only discretion is the route."
    >
      <h2>Five lines</h2>
      <ul>
        <li>A keeper <strong>cannot choose the amount</strong>. The program computes the slice from on-chain state.</li>
        <li>A keeper <strong>cannot omit the check</strong>. <span className="mono">begin_sweep</span> reads the instructions sysvar and refuses unless a <span className="mono">finish_sweep</span> for the same book and release id follows in the same transaction.</li>
        <li>A keeper <strong>cannot redirect the output</strong>. The owner&rsquo;s own token account is the destination the program verifies, before and after.</li>
        <li>A keeper&rsquo;s <strong>only discretion is the route</strong>, bounded by the owner&rsquo;s tolerance against Pyth&rsquo;s price net of confidence.</li>
        <li>A keeper&rsquo;s <strong>only reward is the fixed tip</strong>, 0.0005 SOL, plus the rent it advanced for the receipt, paid from the owner&rsquo;s float.</li>
      </ul>

      <h2>The sweep transaction, atomic without a Jupiter CPI</h2>
      <p>
        A PDA can only sign inside a CPI, so a top-level Jupiter instruction cannot draw from a program-owned escrow. The slice therefore
        passes through the keeper&rsquo;s own USDC account inside one atomic transaction, and the program guarantees — through instruction
        introspection — that the verifying instruction runs at the end. If it does not, the first instruction refuses; if verification fails,
        everything reverts, including the delegate transfer.
      </p>
      <pre>{`0  ComputeBudget      unit limit; unit price
1  begin_sweep        compute the slice; delegate-transfer USDC → the keeper
2  Jupiter setup      if any
3  Jupiter swap       USDC → asset, ExactIn = slice, destination = the owner's account
4  Jupiter cleanup    if any
5  finish_sweep       delta ≥ Pyth min-out; receipt; tip — or everything reverts`}</pre>

      <h2>The price bound</h2>
      <p>
        <span className="mono">finish_sweep</span> reads a Pyth price account for the book&rsquo;s asset, fully verified, under ten minutes old,
        with a confidence band under 1%. The minimum that must arrive is the slice divided by the price <em>plus</em> its confidence, less the
        owner&rsquo;s tolerance, in raw units. For a feed that prices one share rather than one token, the minimum is divided by the mint&rsquo;s
        live scaled-UI multiplier. Below the minimum, the whole transaction reverts.
      </p>

      <h2>Where the price comes from</h2>
      <p>
        Hermes has required an API key since 26 August 2026, and the on-chain SPYX/USD account was not being kept fresh when we looked.
        So a keeper posts its own fully verified update from Hermes when the on-chain one is stale, and closes it after. A stale feed pauses
        sweeps; nothing is lost by waiting.
      </p>

      <h2>Running one</h2>
      <pre>{`SCRIP_KEEPER_KEYPAIR=keeper.json PYTH_API_KEY=… NEXT_PUBLIC_SOLANA_CLUSTER=mainnet-beta npm run keeper`}</pre>
      <p>
        It watches every Book with the rule on, subscribes to each owner&rsquo;s USDC account, syncs watermarks after spends, and reports
        the last sweep and the last reason per book on a health endpoint the app reads.
      </p>
    </DocFrame>
  );
}

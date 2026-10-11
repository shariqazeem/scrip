import Link from "next/link";
import { PageFrame } from "@/components/app/page-frame";

/** Nothing at this address. The four places worth going from here, and no apology. */
export default function NotFound() {
  return (
    <PageFrame
      eyebrow="Not here"
      title="Nothing at this address."
      sub="A name nobody has taken, a receipt that was never written, or a page that has moved. Press ⌘K to jump to a name, a receipt, a run, a grant or a page."
    >
      <div className="sp-actions">
        <Link href="/" className="sp-action is-primary">
          Start saving
        </Link>
        <Link href="/ledger" className="sp-action is-quiet">
          The ledger
        </Link>
        <Link href="/app" className="sp-action is-quiet">
          Your savings
        </Link>
        <Link href="/docs" className="sp-action is-quiet">
          Docs
        </Link>
      </div>
    </PageFrame>
  );
}

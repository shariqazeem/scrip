"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PageFrame } from "@/components/app/page-frame";

/**
 * WHAT HAPPENED, AND WHAT TO DO. The page that could not be built says so in the words a
 * person can act on, and offers the one action that might work: ask again. It never says
 * "something went wrong", and it never shows a stack trace to a visitor — the digest is
 * there so the same error can be found in the server's log.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const refused = /429|rate limit|Too Many Requests/i.test(error.message);
  return (
    <PageFrame
      eyebrow="This page"
      title={refused ? "Solana's endpoint is refusing reads right now." : "This page could not be built."}
      sub={
        refused
          ? "Nothing is lost and nothing was sent. The figures on this page are read from the chain at the moment you ask, and the endpoint is asking us to wait."
          : "The chain, or the cache of it, could not answer. Nothing was sent and nothing was charged."
      }
      actions={
        <>
          <button type="button" className="sp-action is-primary" onClick={reset}>
            Ask again
          </button>
          <Link href="/" className="sp-action is-quiet">
            The floor
          </Link>
        </>
      }
    >
      {error.digest ? <p className="sp-fact-note mono">{error.digest}</p> : null}
    </PageFrame>
  );
}

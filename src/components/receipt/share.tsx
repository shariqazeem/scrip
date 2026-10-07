"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * SHARE A RECEIPT — the phone's own share sheet where there is one, the link copied where
 * there is not. The receipt is the peak of a save; it is the thing worth sending.
 */
export function ShareReceipt({ title, text, className = "sp-btn-link", label = "Share" }: { title: string; text: string; className?: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const url = window.location.href.split("?")[0]!;
        try {
          if (navigator.share) {
            await navigator.share({ title, text, url });
            return;
          }
        } catch {
          return; // closed the sheet: nothing to say
        }
        try {
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1_600);
        } catch {
          // No clipboard either; the address bar still has it.
        }
      }}
    >
      {done ? <Check size={16} strokeWidth={2} aria-hidden /> : <Share2 size={16} strokeWidth={2} aria-hidden />}
      {done ? "Link copied" : label}
    </button>
  );
}

/** "Ask whoever pays you to match it": a message, with a link to /teams that names the saver. */
export function AskForMatch({ from, className }: { from: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const url = `${window.location.origin}/teams?from=${encodeURIComponent(from)}`;
        const text = "I save part of what I'm paid into stocks I own, with Scrip. Would you match it? You can add stock straight to my wallet with one signature, and it prints a receipt that says why.";
        try {
          if (navigator.share) {
            await navigator.share({ title: "Would you match my savings?", text, url });
            return;
          }
        } catch {
          return;
        }
        try {
          await navigator.clipboard.writeText(`${text} ${url}`);
          setDone(true);
          setTimeout(() => setDone(false), 2_000);
        } catch {
          // Nothing to copy into.
        }
      }}
    >
      {done ? "Message copied: send it to whoever pays you" : "Ask whoever pays you to match it"}
    </button>
  );
}

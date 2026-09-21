"use client";

import { useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";

/** The receipt page's only client JavaScript: copy the URL. */
export function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="sp-btn-link"
      onClick={() => {
        void navigator.clipboard.writeText(window.location.href).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1_600);
        });
      }}
    >
      {done ? <Check size={14} strokeWidth={2} aria-hidden /> : <LinkIcon size={14} strokeWidth={2} aria-hidden />}
      {done ? "Copied" : "Copy the link"}
    </button>
  );
}

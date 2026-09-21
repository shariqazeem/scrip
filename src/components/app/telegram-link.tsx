"use client";

import { useEffect, useState } from "react";
import { CopyText } from "./copy-text";

/**
 * A MESSAGE WHEN A STUB PRINTS. Telegram first: the bot's /start carries a one-time code
 * that links this register to a chat; from then on every receipt is one message, and
 * tapping it opens the receipt. No token, no bot username: the section says so.
 */
export function TelegramLink({ owner, bot }: { owner: string; bot: string | null }) {
  const [state, setState] = useState<{ linked: boolean; code: string | null } | null>(null);
  useEffect(() => {
    fetch(`/api/notify/telegram?owner=${owner}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { linked: false, code: null }))
      .then((j: { linked: boolean; code: string | null }) => setState(j))
      .catch(() => setState({ linked: false, code: null }));
  }, [owner]);
  if (!bot) return <p className="sp-fact-note">Telegram messages are not configured on this deployment. When they are, a one-time code links this register to a chat, and every receipt arrives as one message.</p>;
  if (!state) return <p className="sp-fact-note">Checking…</p>;
  if (state.linked) return <p className="sp-fact-note">Linked to Telegram. Every stub that prints for this register is one message; tap it to open the receipt.</p>;
  const link = `https://t.me/${bot}?start=${state.code ?? ""}`;
  return (
    <div>
      <div className="sp-linkline">
        <span className="sp-url">{link}</span>
        <CopyText text={link} label="Copy" />
        <a href={link} className="sp-action is-primary" target="_blank" rel="noreferrer">
          Open in Telegram
        </a>
      </div>
      <p className="sp-fact-note">Press Start in the bot; the code links this register once. Unlink by sending /stop.</p>
    </div>
  );
}

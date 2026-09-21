"use client";

import { useEffect, useState } from "react";

/**
 * INSTALL, AND OFFLINE. Two small truths in the chrome of the register:
 *
 *  — the browser can install Scrip to a home screen, and offers it only when it means it
 *    (a `beforeinstallprompt` event). We never nag: one quiet line, dismissed for good.
 *  — when the network is gone, the register still renders from the last answer this browser
 *    received. It says so, with the time it is showing, because a stale figure presented as
 *    current would be the one thing this product must never do.
 */
type Choosable = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** More than this old and the view is announced as what it is, not passed off as now. */
const STALE_SECONDS = 45;

export function OfflineNotice({ at }: { at: number }) {
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(tick);
    };
  }, []);
  const stale = now - at > STALE_SECONDS;
  if (!offline && !stale) return null;
  const when = new Date(at * 1000).toUTCString().replace("GMT", "UTC");
  return (
    <p className="sp-live-why" role="status">
      {offline
        ? `No network. This is your register as this browser last read it, at ${when}. Nothing has been lost; the chain is the record, and it will catch up when you are back.`
        : `Solana's endpoint is not answering reads right now. This is the register as it was last read, at ${when}; the figures below are that moment, not this one.`}
    </p>
  );
}

export function InstallPrompt() {
  const [evt, setEvt] = useState<Choosable | null>(null);
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage?.getItem("scrip.install.dismissed") === "1") return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as Choosable);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage?.setItem("scrip.install.dismissed", "1");
    } catch {
      // a browser that refuses storage simply gets asked again next time
    }
  };
  if (hidden || !evt) return null;
  return (
    <p className="sp-fact-note">
      Scrip can sit on your home screen and open straight to this register.{" "}
      <button
        type="button"
        className="sp-linkish"
        onClick={() => {
          void evt.prompt().then(() => dismiss());
        }}
      >
        Install it
      </button>
      {" · "}
      <button type="button" className="sp-linkish is-quiet" onClick={dismiss}>
        No thanks
      </button>
    </p>
  );
}

/** Registers the worker that makes the last register readable offline. */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    const id = setTimeout(() => void navigator.serviceWorker.register("/sw.js").catch(() => undefined), 1_200);
    return () => clearTimeout(id);
  }, []);
  return null;
}

"use client";

import { useEffect, useState } from "react";

/**
 * A MOMENT IN THE READER'S OWN TIME ZONE. The server renders it in UTC, which is true for
 * everybody; once the page is in a browser, it is replaced by the reader's own clock, which
 * is what "when" means to a person.
 */
export function LocalTime({ unix, utc }: { unix: number; utc: string }) {
  const [text, setText] = useState(utc);
  useEffect(() => {
    try {
      setText(new Date(unix * 1000).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }));
    } catch {
      // An old browser keeps the UTC line.
    }
  }, [unix]);
  return (
    <time dateTime={new Date(unix * 1000).toISOString()} title={utc}>
      {text}
    </time>
  );
}

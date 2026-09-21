/**
 * THE NYSE REGULAR SESSION, as a fact about the clock.
 *
 * 09:30 to 16:00 America/New_York, Monday to Friday, less the exchange holidays, with two
 * early closes at 13:00. This is what "the stock market is closed" means; the tracker on
 * Solana trades regardless, and the front door says both. Pure, so a test can pin it.
 */
export type Session = {
  readonly open: boolean;
  /** "NYSE open, closes 16:00 ET" or "NYSE closed, reopens Mon 09:30 ET". */
  readonly line: string;
  /** Seconds until the next change of state. */
  readonly until: number;
};

/** Full-day closures, YYYY-MM-DD in New York. */
const CLOSED = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);
/** 13:00 closes. */
const EARLY = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const EARLY_CLOSE_MIN = 13 * 60;

type NY = { ymd: string; weekday: number; minutes: number };

/** The New York wall clock for an instant. */
export function newYork(unixSeconds: number): NY {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(new Date(unixSeconds * 1000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, weekday, minutes: hour * 60 + Number(get("minute")) };
}

function tradingDay(d: NY): boolean {
  return d.weekday >= 1 && d.weekday <= 5 && !CLOSED.has(d.ymd);
}
function closeMinutes(d: NY): number {
  return EARLY.has(d.ymd) ? EARLY_CLOSE_MIN : CLOSE_MIN;
}
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function nyseSession(unixSeconds: number): Session {
  const now = newYork(unixSeconds);
  if (tradingDay(now) && now.minutes >= OPEN_MIN && now.minutes < closeMinutes(now)) {
    const close = closeMinutes(now);
    return { open: true, line: `NYSE open, closes ${fmt(close)} ET`, until: (close - now.minutes) * 60 };
  }
  // Walk forward, a day at a time, to the next session open. Bounded: a fortnight of closures does not exist.
  for (let ahead = 0; ahead < 14; ahead += 1) {
    const t = unixSeconds + ahead * 86_400;
    const d = newYork(t);
    if (!tradingDay(d)) continue;
    if (ahead === 0 && d.minutes >= OPEN_MIN) continue;
    const minutesUntil = ahead === 0 ? OPEN_MIN - d.minutes : (OPEN_MIN - d.minutes) + 0;
    // For a later day, the seconds to its 09:30 from now: whole days plus the clock delta.
    const until = ahead === 0 ? minutesUntil * 60 : ahead * 86_400 + (OPEN_MIN - d.minutes) * 60;
    const when = ahead === 0 ? "today" : ahead === 1 ? "tomorrow" : DAY_NAMES[d.weekday]!;
    return { open: false, line: `NYSE closed, reopens ${when} 09:30 ET`, until: Math.max(60, until) };
  }
  return { open: false, line: "NYSE closed", until: 3600 };
}

function fmt(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

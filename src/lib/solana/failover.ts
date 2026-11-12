/**
 * WHEN THE PAID ENDPOINT SAYS NO, SOLANA'S OWN ANSWERS.
 *
 * Scrip reads the chain through a paid RPC when it has one. On 9 November 2026 that one spent its
 * month's credits and answered every call with 429 "max usage reached". For two and a half days
 * every page that reads the chain read nothing, /curve said "No launch yet" over two launches, and
 * the saving services restarted 20,594 times. Solana's public endpoint answered the same calls the
 * whole time.
 *
 * So a paid endpoint has a fallback: Solana's public endpoint on the same network. A refusal that
 * will not pass by itself (credits spent, a key refused, payment required) sends the endpoint's
 * calls to the fallback for ten minutes; one that may pass (a 5xx, a socket error, a rate limit
 * that outlasted its retry) for one. After that the next call tries the paid endpoint again, and
 * its first good answer puts every call back on it: the day the credits reset, Scrip is back on
 * them without anyone touching a file. Nothing above `gated-fetch.ts` knows which one answered.
 *
 * The network is read from the endpoint's host ("mainnet", "devnet" or "testnet" in it). A host
 * that names none gets no fallback, because an answer from the wrong chain is worse than none.
 * `SOLANA_RPC_FALLBACK=off` turns it off.
 */

const SOLANA_OWN = /(^|\.)api\.(devnet|testnet|mainnet-beta)\.solana\.com$/i;
const PUBLIC = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
} as const;

/** How long a paid endpoint rests after each kind of refusal before it is asked again. */
export const REST_MS = { spent: 10 * 60_000, unwell: 60_000 } as const;
/** A refusal that goes on is said again at most this often, so a month of it is not a month of log. */
const SAY_AGAIN_MS = 60 * 60_000;

/** Solana's public endpoint for the network an endpoint serves; null when there is none to use. */
export function fallbackFor(url: string, env: Record<string, string | undefined> = process.env): string | null {
  if (/^(off|none|0|false)$/i.test(env.SOLANA_RPC_FALLBACK?.trim() ?? "")) return null;
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  // A local validator has nothing to fall back to, and Solana's own endpoint is the fallback.
  if (host === "127.0.0.1" || host === "localhost" || host === "::1" || SOLANA_OWN.test(host)) return null;
  if (host.includes("devnet")) return PUBLIC.devnet;
  if (host.includes("testnet")) return PUBLIC.testnet;
  if (host.includes("mainnet")) return PUBLIC.mainnet;
  return null;
}

/**
 * What a paid endpoint's answer means for the calls behind it. Null: it answered, whatever it
 * said. A JSON-RPC error (a failed simulation, an unknown account) is an answer, and comes back
 * with HTTP 200; only the endpoint refusing to serve at all is a refusal.
 */
export type Refusal = { readonly kind: keyof typeof REST_MS; readonly why: string };
export function refusalOf(status: number, body: string): Refusal | null {
  const said = () => {
    const b = brief(body);
    return b ? ` ${b}` : "";
  };
  if (status === 401 || status === 402 || status === 403) return { kind: "spent", why: `${status}${said()}` };
  if (status === 429) {
    return /max usage|credit|quota|upgrade|exceeded your|plan limit/i.test(body) ? { kind: "spent", why: `429${said()}` } : { kind: "unwell", why: "429 rate limited" };
  }
  if (status >= 500) return { kind: "unwell", why: `${status}${said()}` };
  return null;
}

/** The start of a body, short, for a log line. Never the URL: a paid key travels in it. */
function brief(body: string): string {
  return body.slice(0, 200).replace(/\s+/g, " ").trim().slice(0, 80);
}

export type Failover = {
  readonly fallback: string;
  /** True while the paid endpoint is resting: send the call to the fallback. */
  resting: () => boolean;
  /** The paid endpoint refused: rest it. */
  trip: (r: Refusal) => void;
  /** The paid endpoint answered: every call goes back to it. */
  answered: () => void;
  /** Null while the paid endpoint serves; otherwise since when, why, and until when it rests. */
  status: () => { since: number; why: string; until: number } | null;
};

type State = { since: number; why: string | null; until: number; saidAt: number };

/**
 * ONE STATE PER PAID ENDPOINT PER PROCESS, on `globalThis` for the same reason as the gates: a
 * module evaluated twice must not hold two opinions about whether the endpoint is resting.
 */
const KEY = Symbol.for("scrip.rpc.failover");
function store(): Map<string, State> {
  const g = globalThis as unknown as Record<symbol, Map<string, State> | undefined>;
  return (g[KEY] ??= new Map());
}

export function failoverFor(url: string, fallback: string, now: () => number = Date.now, say: (line: string) => void = (l) => console.warn(l)): Failover {
  const states = store();
  const state = (): State => {
    let s = states.get(url);
    if (!s) {
      s = { since: 0, why: null, until: 0, saidAt: 0 };
      states.set(url, s);
    }
    return s;
  };
  const from = hostOf(url);
  const to = hostOf(fallback);
  return {
    fallback,
    resting: () => now() < state().until,
    trip: (r) => {
      const s = state();
      const t = now();
      const first = s.why === null;
      if (first) s.since = t;
      s.until = t + REST_MS[r.kind];
      if (first || r.why !== s.why || t - s.saidAt >= SAY_AGAIN_MS) {
        say(`rpc: ${from} ${first ? "refused" : "still refuses"} (${r.why}); calls go to ${to}, and ${from} is asked again in ${REST_MS[r.kind] / 60_000} min`);
        s.saidAt = t;
      }
      s.why = r.why;
    },
    answered: () => {
      const s = state();
      if (s.why === null) return;
      say(`rpc: ${from} answers again; calls are back on it after ${Math.round((now() - s.since) / 60_000)} min on ${to}`);
      s.why = null;
      s.until = 0;
      s.since = 0;
    },
    status: () => {
      const s = state();
      return s.why === null ? null : { since: s.since, why: s.why, until: s.until };
    },
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "the endpoint";
  }
}

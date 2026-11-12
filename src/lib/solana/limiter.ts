/**
 * ONE QUEUE PER ENDPOINT. Solana's public endpoints refuse an IP that asks too fast
 * ("Connection rate limits exceeded", 429), and a paid RPC bills by the request; a page
 * that reads twenty accounts, or an indexer walking a thousand signatures, will find either
 * limit without help. Every RPC call the server makes passes through a gate: at most
 * `concurrency` in flight, and at most one start every `1000 / rps` milliseconds.
 *
 * The defaults are chosen for the endpoint: Solana's own `api.*.solana.com` gets a
 * deliberately slow rate, anything else (a paid RPC) a fast one. `SOLANA_RPC_RPS` and
 * `SOLANA_RPC_CONCURRENCY` override them, and can only lower Solana's own.
 *
 * It queues, it never drops: a call waits its turn and then happens. Slow is a cost; a
 * refused read would be a wrong number on a surface.
 */
export type Gate = {
  /** Wait your turn, then call. `weight` is how many calls a batch request carries (default 1). */
  run: <T>(fn: () => Promise<T>, weight?: number) => Promise<T>;
  /** The endpoint refused: hold ALL traffic for a while, not just this call. */
  penalize: () => void;
  /** It answered: forget the penalty. */
  reward: () => void;
  /** How long every caller is currently waiting out, in ms. For a health line. */
  coolingFor: () => number;
  readonly rps: number;
  readonly concurrency: number;
};

/**
 * After a refusal: wait this long, doubling to the cap, before anyone asks again. The cap is
 * deliberately short. A long pause is the polite thing for the endpoint and the wrong thing
 * for the reader: a page that waits thirty seconds shows nothing, while a page that gives up
 * in six can show the last good read and say so.
 */
const COOL_FIRST_MS = 1_500;
const COOL_MAX_MS = 6_000;

const PUBLIC = /(^|\.)(api\.(devnet|testnet|mainnet-beta)\.solana\.com)$/i;

/** True for Solana's own public endpoints, whose limits are Solana's and not Scrip's. */
export function isSolanaPublic(url: string): boolean {
  try {
    return PUBLIC.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * A METHOD WITH A BUDGET OF ITS OWN. Solana's public endpoint lets an IP search a program's
 * accounts (getProgramAccounts) far less often than it answers anything else. Measured on 12 Nov
 * 2026 from Scrip's server: eleven searches in a row, then 429 "Too many requests for a specific
 * RPC call" for about seven seconds. The site and both saving services share that IP, so each
 * process searches at most once every two seconds, and a refusal of the method holds back only
 * that method, for long enough for the window to pass.
 *
 * Reading transactions has a budget of its own too (40 per 10 s per IP, counted per call even
 * inside a batch): a page that read a launch's history in one batch of every signature lost the
 * entries past the budget, and summed what was left.
 */
type Limits = { rps: number; concurrency: number; coolFirstMs?: number; coolMaxMs?: number };
const PUBLIC_METHOD_LIMITS: Record<string, Limits> = {
  getProgramAccounts: { rps: 0.5, concurrency: 1, coolFirstMs: 8_000, coolMaxMs: 10_000 },
  getTransaction: { rps: 3, concurrency: 2, coolFirstMs: 8_000, coolMaxMs: 10_000 },
};

/** The method's own gate on Solana's public endpoint, or null when it has none. */
export function methodGateFor(url: string, method: string): Gate | null {
  const limits = PUBLIC_METHOD_LIMITS[method];
  if (!limits || !isSolanaPublic(url)) return null;
  const key = `${url}#${method}`;
  const gates = store();
  const hit = gates.get(key);
  if (hit) return hit;
  const made = makeGate(url, limits);
  gates.set(key, made);
  return made;
}

export function limitsFor(url: string): { rps: number; concurrency: number } {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  const isPublic = PUBLIC.test(host);
  const isLocal = host === "127.0.0.1" || host === "localhost";
  // Solana's public endpoints cap an IP at 100 calls per 10 s AND a single method at 40 per
  // 10 s; an indexer walking signatures is one method, so the public budget is the tighter one.
  const own = { rps: isLocal ? 2_000 : isPublic ? 4 : 100, concurrency: isLocal ? 64 : isPublic ? 2 : 32 };
  // An override tunes Scrip's own endpoint. It can slow Solana's public one, never speed it up:
  // those limits are Solana's, and since 12 Nov 2026 the public endpoint is also where a paid one
  // hands its calls when it refuses (`failover.ts`), with the override still set for the paid one.
  const rpsSet = Number(process.env.SOLANA_RPC_RPS) || 0;
  const concurrencySet = Number(process.env.SOLANA_RPC_CONCURRENCY) || 0;
  const rps = rpsSet > 0 ? (isPublic ? Math.min(rpsSet, own.rps) : rpsSet) : own.rps;
  const concurrency = concurrencySet > 0 ? (isPublic ? Math.min(concurrencySet, own.concurrency) : concurrencySet) : own.concurrency;
  return { rps, concurrency };
}

/**
 * ONE GATE PER ENDPOINT PER PROCESS, kept on `globalThis`. A dev server (and a route handler
 * under some bundlers) can evaluate the same module more than once; a gate held in a module
 * variable would then be one gate per copy, and the endpoint would see the sum of them. The
 * limit belongs to the process, so the gate lives where the process can find it.
 */
const KEY = Symbol.for("scrip.rpc.gates");
type Store = { gates?: Map<string, Gate> };
function store(): Map<string, Gate> {
  const g = globalThis as unknown as Record<symbol, Store>;
  const slot = (g[KEY] ??= {});
  return (slot.gates ??= new Map());
}

export function gateFor(url: string): Gate {
  const gates = store();
  const hit = gates.get(url);
  if (hit) return hit;
  const made = makeGate(url);
  gates.set(url, made);
  return made;
}

/** A gate of its own, for a test. Prefer `gateFor`, which shares one per endpoint. */
export function makeGate(url: string, limits: Limits = limitsFor(url)): Gate {
  const { rps, concurrency } = limits;
  const coolFirst = limits.coolFirstMs ?? COOL_FIRST_MS;
  const coolMax = limits.coolMaxMs ?? COOL_MAX_MS;
  const minGap = 1000 / rps;
  const waiting: Array<{ go: () => void; weight: number }> = [];
  let inFlight = 0;
  let nextAt = 0;
  let coolUntil = 0;
  let cool = 0;

  const pump = () => {
    if (inFlight >= concurrency || waiting.length === 0) return;
    const wait = Math.max(0, nextAt - Date.now(), coolUntil - Date.now());
    if (wait > 0) {
      setTimeout(pump, wait);
      return;
    }
    const next = waiting.shift();
    if (!next) return;
    // A batch of n calls is n calls to the endpoint: the next start waits for all of them.
    nextAt = Date.now() + minGap * next.weight;
    inFlight += 1;
    next.go();
    if (waiting.length > 0) setTimeout(pump, minGap * next.weight);
  };

  const run = async <T>(fn: () => Promise<T>, weight = 1): Promise<T> => {
    await new Promise<void>((resolve) => {
      waiting.push({ go: resolve, weight: Math.max(1, Math.floor(weight)) });
      pump();
    });
    try {
      return await fn();
    } finally {
      inFlight -= 1;
      pump();
    }
  };
  return {
    run,
    penalize: () => {
      cool = cool === 0 ? coolFirst : Math.min(cool * 2, coolMax);
      coolUntil = Date.now() + cool;
    },
    reward: () => {
      cool = 0;
      coolUntil = 0;
    },
    coolingFor: () => Math.max(0, coolUntil - Date.now()),
    rps,
    concurrency,
  };
}

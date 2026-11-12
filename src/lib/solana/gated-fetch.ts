import { failoverFor, fallbackFor, refusalOf } from "./failover";
import { type MinimalResponse, keepAlivePost } from "./http";
import { type Gate, gateFor, methodGateFor } from "./limiter";

/**
 * THE ONE PLACE A REQUEST MEETS THE ENDPOINT. Every call waits its turn at the endpoint's
 * gate; if the answer is 429, the gate is told, and then EVERY caller waits out the same
 * cool-off instead of each retrying into the same refusal. A call is retried a couple of
 * times behind that wait and then gives up, so the surface above can say what it could not
 * read rather than hanging on a queue of doomed retries.
 *
 * A paid endpoint that refuses outright (its credits spent, its key refused, the service down)
 * hands the call to Solana's own endpoint on the same network, through that endpoint's own
 * gate, and rests until it is worth asking again (`failover.ts`). The caller gets an answer
 * either way and never learns which endpoint gave it.
 */
const TRIES = 2;

type Post = (input: unknown, init: unknown) => Promise<MinimalResponse>;

export function gatedFetch(
  url: string,
  deps: { post?: Post; now?: () => number; say?: (line: string) => void } = {},
): (input: unknown, init: unknown) => Promise<Response> {
  const post = deps.post ?? keepAlivePost;
  const gate = gateFor(url);
  const fallback = fallbackFor(url);
  const failover = fallback ? failoverFor(url, fallback, deps.now, deps.say) : null;
  const backup = fallback ? gateFor(fallback) : null;
  const trace = process.env.SCRIP_RPC_DEBUG === "1";

  /**
   * Up to TRIES calls through one gate, waiting out its cool-off after each 429. A method with a
   * budget of its own on Solana's public endpoint (`methodGateFor`) also waits at its own gate,
   * and gets one more try, because its refusal lasts longer than the endpoint's.
   */
  const attempt = async (g: Gate, target: unknown, init: unknown): Promise<MinimalResponse> => {
    const { method, count } = callsOf(init);
    const m = methodGateFor(String(target), method);
    const tries = m ? TRIES + 1 : TRIES;
    let last: MinimalResponse | null = null;
    for (let n = 0; n < tries; n += 1) {
      const res = m ? await m.run(() => g.run(() => post(target, init)), count) : await g.run(() => post(target, init));
      if (res.status !== 429) {
        g.reward();
        m?.reward();
        return res;
      }
      last = res;
      const body = await res.text();
      // Spent credits do not come back in a second and a half: hand the call on now instead of
      // making everyone queued behind it wait out a cool-off for the same answer.
      if (failover && target !== fallback && refusalOf(429, body)?.kind === "spent") break;
      // Solana's own endpoint refuses one method at a time: hold back that method, not the rest.
      if (m && /specific rpc call/i.test(body)) m.penalize();
      else g.penalize();
    }
    return last as MinimalResponse;
  };

  return async (input: unknown, init: unknown) => {
    const at = Date.now();
    const done = (res: MinimalResponse, via: string) => {
      if (trace) console.log(`rpc ${methodOf(init)} ${res.status === 429 ? "REFUSED " : ""}${Date.now() - at}ms${via}`);
      return res as unknown as Response;
    };
    if (!failover || !fallback || !backup) return done(await attempt(gate, input, init), "");
    if (failover.resting()) return done(await attempt(backup, fallback, init), " via the fallback");

    let res: MinimalResponse;
    try {
      res = await attempt(gate, input, init);
    } catch (err) {
      // No answer at all (a socket closed, a name that did not resolve): the call still needs one.
      failover.trip({ kind: "unwell", why: err instanceof Error ? err.message.slice(0, 80) : "no answer" });
      return done(await attempt(backup, fallback, init), " via the fallback");
    }
    // A good answer can be megabytes of accounts; only a non-2xx is worth reading for a reason.
    const refusal = res.ok ? null : refusalOf(res.status, await res.text());
    if (refusal) {
      failover.trip(refusal);
      return done(await attempt(backup, fallback, init), " via the fallback");
    }
    failover.answered();
    return done(res, "");
  };
}

/** The JSON-RPC method and how many calls the request carries: a batch is named by its first. */
function callsOf(init: unknown): { method: string; count: number } {
  const body = (init as { body?: unknown } | null)?.body;
  if (typeof body !== "string") return { method: "?", count: 1 };
  try {
    const parsed: unknown = JSON.parse(body);
    if (Array.isArray(parsed)) {
      const first = parsed[0] as { method?: string } | undefined;
      return { method: first?.method ?? "?", count: Math.max(1, parsed.length) };
    }
    return { method: (parsed as { method?: string }).method ?? "?", count: 1 };
  } catch {
    return { method: "?", count: 1 };
  }
}

/** The method, for a trace line: "getTransaction×10" for a batch. */
function methodOf(init: unknown): string {
  const { method, count } = callsOf(init);
  return count > 1 ? `${method}×${count}` : method;
}

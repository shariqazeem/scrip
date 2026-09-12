/**
 * FAILURE RETURNS A VALUE AND NEVER THROWS FOR CONTROL FLOW.
 *
 * A stale price, a missing multiplier, a failed quote: each one HOLDS and says why. This is
 * the single habit carried from Sage that is worth more than any of the code — it is the
 * reason a failed judgment there never corrupted a payout.
 *
 * A thrown exception in money-critical code has two bad outcomes and no good one: it is
 * caught somewhere generic and becomes a shrug, or it escapes and takes the request with it.
 * A held value carries its reason all the way to the surface, where it can be rendered as an
 * honest waiting state instead of a number nobody can defend.
 *
 * `why` is written to be READ BY A USER, not only logged. "Gold price is 40 minutes stale"
 * is a sentence a person can act on; "ERR_ORACLE_3" is not.
 */
export type Outcome<T> = { ok: true; value: T } | { ok: false; why: string };

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

/** Hold, and say why. The name is the instruction. */
export const held = <T = never>(why: string): Outcome<T> => ({ ok: false, why });

/** Narrowing helper for call sites that only care about the happy path. */
export function isOk<T>(o: Outcome<T>): o is { ok: true; value: T } {
  return o.ok;
}

/**
 * Chain an outcome without unwrapping it by hand. A hold passes straight through with its
 * reason intact — the reason must never be replaced by a generic one further up the stack,
 * because the specific sentence is the whole point.
 */
export function map<A, B>(o: Outcome<A>, f: (a: A) => B): Outcome<B> {
  return o.ok ? ok(f(o.value)) : o;
}

export function flatMap<A, B>(o: Outcome<A>, f: (a: A) => Outcome<B>): Outcome<B> {
  return o.ok ? f(o.value) : o;
}

/**
 * Collect a list of outcomes, holding on the FIRST failure with its reason. Used where a
 * partial answer is worse than none — an allocation with one leg missing is not an
 * allocation, it is a different allocation nobody signed.
 */
export function all<T>(items: readonly Outcome<T>[]): Outcome<T[]> {
  const out: T[] = [];
  for (const it of items) {
    if (!it.ok) return it;
    out.push(it.value);
  }
  return ok(out);
}

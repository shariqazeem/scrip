/**
 * HOW THE SAVING SERVICE SHARES ITS TIME. Kept apart from the service so the rules that decide
 * whether every save runs are tested, not just read.
 */

/** Run `fn` over every item, at most `limit` at a time. `fn` must not throw. */
export async function eachAtMost<T>(limit: number, items: readonly T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
}

/** Whether `p` settles within `ms`. It keeps running either way. */
export async function finishesWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([p.then(() => true), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether a backup should still leave something first seen at `since` to the first service.
 * With no patience set, nobody stands by.
 */
export function standingBy(backupAfterSeconds: number, since: number, now: number): boolean {
  return backupAfterSeconds > 0 && now - since < backupAfterSeconds;
}

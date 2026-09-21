/**
 * THE INDEXER, ONCE, WITH ITS PROGRESS ON STDOUT. `POST /api/maintenance` does the same work
 * inside the server; this is for a first backfill, where minutes of silence is not a thing a
 * person should have to guess about.
 *
 *   npx tsx scripts/index-once.ts [--skip-watcher]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

for (const line of readFileSync(join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!;
}

async function main() {
  const { connection, mainnetConnection } = await import("@/lib/solana/connection");
  const { indexBooks, indexGrants, indexReceipts, refreshMeasurements } = await import("@/lib/ledger/indexer");
  const { chainReader, runWatcher } = await import("@/lib/corporate-actions/watcher");
  const { measureDue } = await import("@/lib/ledger/crank");
  const conn = connection();
  const now = Math.floor(Date.now() / 1000);
  const step = async <T>(what: string, fn: () => Promise<T>) => {
    const at = Date.now();
    const v = await fn();
    console.log(`${what}: ${JSON.stringify(v)} (${((Date.now() - at) / 1000).toFixed(1)}s)`);
    return v;
  };
  if (!process.argv.includes("--skip-watcher")) await step("multipliers", async () => (await runWatcher(chainReader(mainnetConnection()), now)).anyHeld);
  await step("receipts", () => indexReceipts(conn));
  await step("books", () => indexBooks(conn, now));
  await step("grants", () => indexGrants(conn, now));
  await step("measure", () => measureDue(conn, now));
  await step("refresh", () => refreshMeasurements(conn, now));
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);

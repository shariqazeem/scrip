import "server-only";

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { cluster } from "@/lib/solana/cluster";
import * as schema from "./schema";

/**
 * THE DATABASE IS A CACHE. THE CHAIN IS THE MEMORY. Losing this file costs speed, never
 * truth: a re-index rebuilds it.
 *
 * ONE FILE PER CLUSTER. `var/scrip.mainnet-beta.db` and `var/scrip.devnet.db` are different
 * files, so a devnet receipt can never render under a mainnet chip. That was a defect in
 * the predecessor, found by switching the cluster and watching devnet rows survive.
 *
 * Initialization is LAZY: the file opens and the migrations run on the first query, never
 * at import time, so `next build` can collect routes that import this without touching it.
 */
type DB = BetterSQLite3Database<typeof schema>;

export function dbPath(): string {
  const explicit = process.env.SCRIP_DB_PATH?.trim();
  if (explicit) return explicit;
  return join(process.cwd(), "var", `scrip.${cluster()}.db`);
}

function init(): DB {
  const path = dbPath();
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite, { schema });
  try {
    migrate(database, { migrationsFolder: join(process.cwd(), "drizzle") });
  } catch (err) {
    console.error("[db] migration failed:", err);
  }
  return database;
}

const g = globalThis as unknown as { __scripDb?: DB; __scripDbPath?: string };
function getDb(): DB {
  const path = dbPath();
  if (!g.__scripDb || g.__scripDbPath !== path) {
    g.__scripDb = init();
    g.__scripDbPath = path;
  }
  return g.__scripDb;
}

/** Lazily-initialized handle. Property access triggers init() on first use. */
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };

import "server-only";

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

/**
 * The database, isolated here so swapping the driver is a one-file change.
 *
 * THE DATABASE IS A CACHE. THE CHAIN IS THE MEMORY. Every row here mirrors something that
 * exists on Solana — a receipt account, a token balance, an issuer multiplier. Losing this
 * file costs speed, never truth: it can be rebuilt by re-indexing. Nothing is stored here
 * that only exists here.
 *
 * Initialization is LAZY (see the proxy): the file open and the migrations run on the first
 * query at runtime, never at import time, so `next build` can collect routes that import
 * this module without ever opening the file.
 *
 * Ported from Sage.
 */
type DB = BetterSQLite3Database<typeof schema>;

const DB_PATH = process.env.WEBGOLD_DB_PATH ?? join(process.cwd(), "var", "webgold.db");

function init(): DB {
  // ":memory:" (the test path) has no directory to create.
  if (DB_PATH !== ":memory:") {
    const dir = dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const database = drizzle(sqlite, { schema });
  try {
    migrate(database, { migrationsFolder: join(process.cwd(), "drizzle") });
  } catch (err) {
    // Holds and says why, rather than throwing for control flow.
    console.error("[db] migration failed:", err);
  }
  return database;
}

// Memoize across Next HMR so a hot reload does not reopen the file each render.
const g = globalThis as unknown as { __webgoldDb?: DB };
function getDb(): DB {
  return (g.__webgoldDb ??= init());
}

/**
 * Lazily-initialized handle. Property access triggers init() on first use, so importing
 * this module — at build time, or from a route that never queries — is side-effect free.
 */
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };

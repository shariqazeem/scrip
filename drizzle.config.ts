import { defineConfig } from "drizzle-kit";

// Local dialect is SQLite (better-sqlite3). A hosted swap (Turso/libsql) keeps the
// same dialect and these migrations; only src/lib/db/index.ts changes.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
});

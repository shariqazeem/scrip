import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

// `server-only` / `client-only` are Next build-time markers with no runtime package —
// alias them to an empty module so server code unit-tests directly.
const emptyModule = fileURLToPath(new URL("./vitest.empty.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": emptyModule,
      "client-only": emptyModule,
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "anchor/**"],
    css: false,
    /**
     * Per-file PROCESS isolation, pinned explicitly rather than relied on as a default.
     * Each test file gets its own forked process, its own module registry, its own
     * `process.env` and — with the in-memory SQLite below — its own database. A test
     * that mutates env or writes rows can never bleed into a concurrently-running file.
     * This is what makes the suite contention-safe. Ported from Sage.
     */
    pool: "forks",
    isolate: true,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // DB-backed tests run against an isolated in-memory SQLite: real schema, real
    // constraints, never the dev database.
    env: { WEBGOLD_DB_PATH: ":memory:" },
  },
});

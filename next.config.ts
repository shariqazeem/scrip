import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /**
   * BUILD BESIDE THE RUNNING SERVER, NOT OVER IT.
   *
   * `next build` rewrites `.next` in place while `next dev` (or `next start`) is serving from
   * it, so for the length of a build every page the old process tries to render can miss its
   * manifest — measured here on 2026-09-12: a `npm run build` against a live dev server turned
   * every route into an Internal Server Error until the server was restarted, with
   * `ENOENT: .next/server/app/app/page/build-manifest.json` in the log.
   *
   * `npm run build` now writes to `.next-build` and leaves the serving directory alone. Ported
   * from Sage, where the same thing happened on production during five consecutive deploys.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the workspace root so Turbopack never infers it from a stray lockfile
  // elsewhere on the machine.
  turbopack: { root: __dirname },
  // better-sqlite3 is a native module — keep it out of the server bundle.
  serverExternalPackages: ["better-sqlite3"],
  /**
   * Retired pages, kept as addresses. Saving is Scrip's job, done by its servers and checked by
   * the program; nobody using Scrip needs a page about the machinery, so old links land on the
   * page that says what a save is.
   */
  async redirects() {
    return [{ source: "/docs/keepers", destination: "/docs/how-the-rule-sees-money", permanent: true }];
  },
};

export default nextConfig;

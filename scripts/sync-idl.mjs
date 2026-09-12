#!/usr/bin/env node
/**
 * Copy the built Anchor IDL and its TypeScript types out of `anchor/target/` (which is
 * gitignored, because it is 2GB of build artifacts) into `src/lib/anchor/` (which is
 * committed, because the web app cannot be built without them).
 *
 * The copy is the drift risk this creates, so `src/lib/solana/program.test.ts` reads the
 * committed IDL, `Anchor.toml` and the `declare_id!` in the program source and fails if any
 * of the three disagree — and fails if the committed IDL is stale against a freshly built
 * one. Run this every time the program changes; the test is what makes forgetting loud.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pairs = [
  ["anchor/target/idl/webgold.json", "src/lib/anchor/webgold.json"],
  ["anchor/target/types/webgold.ts", "src/lib/anchor/webgold.ts"],
];

let copied = 0;
for (const [from, to] of pairs) {
  const src = join(root, from);
  if (!existsSync(src)) {
    console.error(`[sync-idl] missing ${from} — run \`anchor build\` in anchor/ first`);
    process.exit(1);
  }
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(src, join(root, to));
  console.log(`[sync-idl] ${from} → ${to}`);
  copied += 1;
}
console.log(`[sync-idl] ${copied} file(s) in sync`);

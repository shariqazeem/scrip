import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Formatting rules that would fight Prettier.
  eslintConfigPrettier,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // The build writes beside the serving directory (see next.config.ts). Both are build
      // output and neither is source. `build-dirs.test.ts` reads this file, .gitignore,
      // .prettierignore and the build script, and fails if they stop agreeing.
      ".next-build/**",
      "out/**",
      "build/**",
      "coverage/**",
      "next-env.d.ts",
      "drizzle/**",
      // The Anchor program is Rust, linted by clippy — not the Next app's ESLint.
      "anchor/target/**",
    ],
  },
];

export default eslintConfig;

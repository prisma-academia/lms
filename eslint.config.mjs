import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored pdf.js worker, copied verbatim from node_modules by
    // scripts/copy-pdf-worker.mjs. Not ours to lint or fix.
    "public/pdf.worker.min.mjs",
    // `mastra build` output. Multi-megabyte generated bundles that took the
    // linter's heap out — `npm run lint` died with OOM before reaching src.
    ".mastra/**",
  ]),
]);

export default eslintConfig;

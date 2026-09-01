import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

const nextConfig: NextConfig = {
  // Mastra and its storage adapters ship native/dynamic modules that must not
  // be bundled — they are loaded at runtime by the course-builder API route.
  serverExternalPackages: [
    "@mastra/core",
    "@mastra/duckdb",
    "@mastra/libsql",
    "@mastra/loggers",
    "@mastra/observability",
    "@duckdb/node-api",
    "@libsql/client",
    "sharp",
  ],
  // `sharp` loads its libvips shared object (`libvips-cpp.so.*`) out of a
  // sibling `@img/sharp-libvips-*` package at dlopen time, which file tracing
  // does not see — on Vercel that produced ERR_DLOPEN_FAILED. Ship the whole
  // `@img` tree with the two routes that actually resize images. Entries that
  // do not exist for the build platform are simply skipped.
  outputFileTracingIncludes: {
    "/api/tenant/settings/logo/finalize": ["./node_modules/@img/**"],
    "/api/tenant/settings/favicon": ["./node_modules/@img/**"],
  },
};

export default withNextIntl(nextConfig);

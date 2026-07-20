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
  ],
};

export default withNextIntl(nextConfig);

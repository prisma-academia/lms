import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./lib/i18n/request.ts");

/**
 * The one origin uploaded assets (logos, hero images, lesson media) are served
 * from. Mirrors `publicUrlForKey` in `lib/storage/s3.ts`; read from the raw
 * environment because this file is evaluated before `lib/env.ts` validation is
 * meaningful (a build must not fail on an optional variable).
 */
function assetOrigin(): string | null {
  const candidates = [
    process.env.S3_PUBLIC_BASE_URL,
    process.env.S3_ENDPOINT,
    process.env.S3_BUCKET && process.env.S3_REGION
      ? `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com`
      : undefined,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate).origin;
    } catch {
      // Malformed value: skip it rather than emit a broken header.
    }
  }
  return null;
}

/**
 * Sent on every response.
 *
 * Staff admin, the learner app and tenant-authored pages all share one origin
 * per tenant, so "may this page be framed" has one answer for all of them:
 * only by itself. That still allows the admin's own preview iframes and stops
 * a third-party page from framing a login or admin screen to capture clicks.
 */
const BASE_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
];

/**
 * Sign-in, registration and password screens.
 *
 * These are the pages where a credential is typed, and (once tenants can design
 * them) the pages where tenant-authored CSS sits beside a password field. CSS
 * cannot run script, but `url()` can make a request, and a request whose URL
 * depends on what matched is a read. Confining images, fonts and media to this
 * origin and the asset bucket removes the place such a request could go.
 *
 * Deliberately no `script-src`/`default-src`: Next's own inline bootstrap needs
 * a nonce to survive those, and that is a larger change than this one.
 */
function authSecurityHeaders() {
  const assets = assetOrigin();
  const csp = [
    "frame-ancestors 'none'",
    `img-src 'self' data: blob:${assets ? ` ${assets}` : ""}`,
    "font-src 'self' data:",
    `media-src 'self'${assets ? ` ${assets}` : ""}`,
  ].join("; ");

  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: csp },
  ];
}

const nextConfig: NextConfig = {
  // Mastra and its storage adapters ship native/dynamic modules that must not
  // be bundled — they are loaded at runtime by the course-builder API route.
  // `@mastra/pg` is the adapter actually in use (`src/mastra/index.ts`).
  serverExternalPackages: [
    "@mastra/core",
    "@mastra/pg",
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
  async headers() {
    // Header rules match the path the browser asked for, before the proxy
    // rewrites it — so these are the public URLs (`/auth/login`), not the
    // internal ones (`/c/auth/login`). When two rules set the same header the
    // later rule wins, which is how the auth pages get the stricter policy.
    const auth = authSecurityHeaders();
    return [
      { source: "/:path*", headers: BASE_SECURITY_HEADERS },
      { source: "/auth/:path*", headers: auth },
      { source: "/admin/auth/:path*", headers: auth },
    ];
  },
};

export default withNextIntl(nextConfig);

import type { MetadataRoute } from "next";
import type { HostContext } from "@/lib/auth/context";

const BLOCK_ALL: MetadataRoute.Robots = { rules: { userAgent: "*", disallow: "/" } };

/**
 * robots.txt rules for one host. app/robots.ts answers for every host
 * (dotted paths skip the proxy), so the rules depend on who asked:
 * - apex marketing site: crawlable, with its sitemap;
 * - operator console and unknown hosts: never crawled;
 * - academy hosts: public pages crawlable. Admin and learner screens already
 *   send noindex; disallowing them here also saves crawl budget.
 * Nothing is crawlable outside production, matching buildPlatformMetadata.
 */
export function robotsFor(mode: HostContext["mode"], origin: URL, production: boolean): MetadataRoute.Robots {
  if (!production || mode === "platform" || mode === "unknown") return BLOCK_ALL;

  const sitemap = new URL("/sitemap.xml", origin).toString();
  if (mode === "apex") {
    return { rules: { userAgent: "*", allow: "/", disallow: ["/api/"] }, sitemap };
  }
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/auth/"] },
    sitemap,
  };
}

import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveHost } from "@/lib/auth/context";
import { requestOrigin } from "@/lib/site/metadata";

/**
 * Host-aware like app/robots.ts: each host lists only its own URLs, so an
 * academy's sitemap never advertises the marketing site or another academy.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const ctx = resolveHost(h.get("x-forwarded-host") ?? h.get("host"));
  const origin = await requestOrigin();
  const url = (path: string) => new URL(path, origin).toString();

  if (ctx.mode === "apex") {
    return [
      { url: url("/"), changeFrequency: "weekly", priority: 1 },
      { url: url("/register"), changeFrequency: "monthly", priority: 0.6 },
    ];
  }

  if (ctx.mode === "tenant") {
    return [{ url: url("/"), changeFrequency: "weekly", priority: 1 }];
  }

  return [];
}

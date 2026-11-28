import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveHost } from "@/lib/auth/context";
import { isProd } from "@/lib/env";
import { requestOrigin } from "@/lib/site/metadata";
import { robotsFor } from "@/lib/site/robots";

/** Host-aware robots.txt; the rules live in lib/site/robots.ts. */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const ctx = resolveHost(h.get("x-forwarded-host") ?? h.get("host"));
  return robotsFor(ctx.mode, await requestOrigin(), isProd);
}

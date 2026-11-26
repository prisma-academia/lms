import type { Metadata } from "next";
import { buildTenantMetadata, loadTenantBranding, requestOrigin } from "@/lib/site/metadata";

/** Link-preview descriptions are cut off around here anyway; cut at a word instead. */
const DESCRIPTION_LIMIT = 200;

function summarise(text: string | null | undefined): string | null {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= DESCRIPTION_LIMIT) return flat;
  const cut = flat.slice(0, DESCRIPTION_LIMIT);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), DESCRIPTION_LIMIT - 40)).trimEnd()}…`;
}

/**
 * Metadata for one of the academy's built-in public pages.
 *
 * A shared course link is mostly seen as a preview card — in a chat, in a feed —
 * before anyone opens it. So each page says what it is in Open Graph and
 * Twitter terms: its own title, its own description, its own picture when it
 * has one, and a canonical address that never includes a `?ref=` code (the
 * same course shared by ten staff members is one page, not ten).
 */
export async function publicPageMetadata(page: {
  /** Path on this host, e.g. `/courses/intro-to-budgeting`. */
  path: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
}): Promise<Metadata> {
  const [origin, branding] = await Promise.all([requestOrigin(), loadTenantBranding()]);
  if (!branding) return {};

  const base = buildTenantMetadata(origin, branding, "public", {
    title: page.title,
    description: summarise(page.description),
    ogImageUrl: page.imageUrl,
  });
  const url = new URL(page.path, origin);

  return {
    ...base,
    alternates: { canonical: url },
    openGraph: { ...base.openGraph, url },
  };
}

/** For an address with nothing public behind it: say nothing, and ask not to be indexed. */
export const UNLISTED_METADATA: Metadata = {
  title: "Page not available",
  robots: { index: false, follow: false },
};

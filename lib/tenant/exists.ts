import { prisma } from "@/lib/db/client";

/**
 * Is there an academy at this subdomain?
 *
 * Asked by the proxy, before any page renders — the only point at which the
 * answer can still become a real 404. A host that merely LOOKS like an academy
 * (`anything.example.com`) used to be routed as one: every page then discovered
 * for itself that the academy did not exist, by which time the response had
 * already started with a 200 and a loading screen. Search engines and link
 * checkers saw a working site at every made-up address.
 *
 * Three answers:
 *  - `true`  — it exists (in any status; a suspended academy is still an
 *              academy, and has its own maintenance screen);
 *  - `false` — there is no such academy;
 *  - `null`  — could not tell (database slow or down). The proxy then lets the
 *              request through and the page decides, as before: a database
 *              hiccup must never turn every academy into "not found".
 *
 * Cached in memory, because this runs on every page request. A real academy is
 * remembered for a minute; a missing one only briefly, so an academy that was
 * registered a moment ago is not told it does not exist.
 */

const FOUND_TTL_MS = 60_000;
const MISSING_TTL_MS = 10_000;
const LOOKUP_TIMEOUT_MS = 2_500;
/** A host name is visitor input; made-up ones must not grow this forever. */
const MAX_ENTRIES = 500;

const cache = new Map<string, { exists: boolean; at: number }>();

function remember(slug: string, exists: boolean) {
  cache.delete(slug); // re-insert so the newest entry is last
  cache.set(slug, { exists, at: Date.now() });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export async function academyExists(slug: string): Promise<boolean | null> {
  const key = slug.trim().toLowerCase();
  if (!key) return false;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < (cached.exists ? FOUND_TTL_MS : MISSING_TTL_MS)) {
    return cached.exists;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const found = await Promise.race([
      // `Tenant` is a global table, not a tenant-scoped one, so this needs no
      // request context (the same lookup lib/site/public-catalog.ts makes).
      prisma.tenant.findUnique({ where: { slug: key }, select: { id: true } }).then((row) => row != null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
      }),
    ]);
    if (found !== null) remember(key, found);
    return found;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Drop what is remembered. For tests. Not a way to announce a new academy: the
 * proxy keeps its own copy of this module, so a route handler calling this
 * would clear a different cache — the short MISSING_TTL_MS is what lets a
 * newly registered academy through.
 */
export function forgetAcademy(slug?: string): void {
  if (slug) cache.delete(slug.trim().toLowerCase());
  else cache.clear();
}

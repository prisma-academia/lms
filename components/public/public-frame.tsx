import type { ReactNode } from "react";
import { prisma } from "@/lib/db/client";
import { runWithContext } from "@/lib/db/tenant-context";
import { authHref } from "@/lib/auth/next-path";
import { loadTenantBranding } from "@/lib/site/metadata";
import { TenantLandingShell } from "@/components/tenant/landing-shell";

/**
 * The frame around the academy's built-in public pages: the same header and
 * footer a visitor sees on the site's own pages, so the catalogue reads as part
 * of the site rather than as a different product bolted onto it.
 *
 * `next` is where the header's Sign in / Enroll buttons should bring the
 * visitor back to. On a course page that is the course.
 */
export async function PublicFrame({
  tenantId,
  next,
  children,
}: {
  tenantId: string;
  next?: string | null;
  children: ReactNode;
}) {
  const [branding, navPages] = await Promise.all([
    loadTenantBranding(),
    // Explicit tenant binding: see the note at the top of lib/site/public-catalog.ts.
    Promise.resolve(
      runWithContext({ mode: "tenant-client", tenantId }, () =>
        prisma.sitePage.findMany({
          where: { tenantId, status: "PUBLISHED", showInNav: true, isHome: false },
          orderBy: { navOrder: "asc" },
          select: { slug: true, title: true },
        })
      )
    ),
  ]);

  return (
    <TenantLandingShell
      orgName={branding?.name ?? "Academy"}
      logoUrl={branding?.logoUrl ?? null}
      navLinks={[
        { href: "/courses", label: "Courses" },
        ...navPages.map((p) => ({ href: `/${p.slug}`, label: p.title })),
      ]}
      signInHref={authHref("login", next)}
      registerHref={authHref("register", next)}
    >
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </TenantLandingShell>
  );
}

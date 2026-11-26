import type { Metadata } from "next";
import Link from "next/link";
import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { loadTenantBranding } from "@/lib/site/metadata";
import { publicPageMetadata } from "@/lib/site/public-metadata";
import { listPublicProgrammes } from "@/lib/site/public-catalog";
import { plural } from "@/lib/site/public-format";
import { PublicFrame } from "@/components/public/public-frame";
import { PublicProgrammeCardView } from "@/components/public/catalogue-cards";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/** The academy's programmes, for a visitor who is not signed in. */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await loadTenantBranding();
  return publicPageMetadata({
    path: "/programmes",
    title: "Programmes",
    description: branding ? `Programmes of study at ${branding.name}.` : null,
  });
}

export default async function PublicProgrammesPage() {
  const page = await requireExistingTenant();
  const tenantId = page.tenant!.id;
  const [branding, programmes] = await Promise.all([
    loadTenantBranding(),
    listPublicProgrammes(tenantId),
  ]);

  return (
    <PublicFrame tenantId={tenantId} next="/programmes">
      <header className="mb-6">
        <h1 className="font-heading text-3xl leading-tight sm:text-4xl">Programmes</h1>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {programmes.length === 0
            ? "Several courses taken together, with one enrolment."
            : `${plural(programmes.length, "programme")} — several courses taken together, with one enrolment.`}
        </p>
      </header>

      {programmes.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState
            icon="layers"
            title="No programmes yet"
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/courses">Browse courses</Link>
              </Button>
            }
          >
            Programmes will appear here once they are published. Individual courses are open now.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {programmes.map((programme) => (
            <li key={programme.id}>
              <PublicProgrammeCardView programme={programme} locale={branding?.settings.locale} />
            </li>
          ))}
        </ul>
      )}
    </PublicFrame>
  );
}

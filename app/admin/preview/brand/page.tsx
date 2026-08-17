import { notFound } from "next/navigation";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/client";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { brandingAssetUrls } from "@/lib/tenant/branding-assets";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import { PreviewBanner } from "@/components/preview-banner";

/**
 * A brand sheet: the tenant's logo, theme and primary colour applied to the
 * actual UI primitives the platform is built from.
 *
 * Deliberately not a screenshot of one real page. A theme lands across three
 * surfaces (/admin, /c, /t) and the question an admin is asking — "does this
 * colour work, is the logo the right weight" — is answered faster by seeing the
 * components side by side than by hunting for a button on the dashboard.
 *
 * The theme is applied by the admin layout chain that already wraps this route,
 * so what renders here is the tenant's real tokens, not a copy of them.
 */
export const dynamic = "force-dynamic";

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`h-14 rounded-[10px] border-2 border-border ${className}`} />
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] border-2 border-border bg-card p-5">
      <h2 className="font-heading text-sm uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function BrandPreviewPage() {
  const actor = await requireTenantPage(PERMISSIONS.TENANT_SETTINGS_READ.key);
  const tenant = await prisma.tenant.findUnique({ where: { id: actor.tenantId } });
  if (!tenant) notFound();

  const settings = parseTenantSettings(tenant.settingsJson);
  const urls = brandingAssetUrls(settings);

  const assets = [
    { label: "Logo", url: urls.logoUrl, size: "h-12" },
    { label: "Favicon 32", url: urls.icon32Url, size: "h-8 w-8" },
    { label: "Apple touch 180", url: urls.apple180Url, size: "h-12 w-12" },
    { label: "Social image 1200×630", url: urls.og1200Url, size: "h-20" },
  ];

  return (
    <div className="min-h-[100dvh] bg-background">
      <PreviewBanner label="Brand preview" />

      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-center gap-4">
          {urls.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls.logoUrl} alt={`${tenant.name} logo`} className="h-12 w-auto" />
          ) : (
            <div className="flex h-12 items-center rounded-[10px] border-2 border-dashed border-border px-4 text-xs font-bold text-muted-foreground">
              No logo uploaded
            </div>
          )}
          <div>
            <h1 className="font-heading text-2xl">{tenant.name}</h1>
            <p className="text-xs font-medium text-muted-foreground">
              Theme &ldquo;{settings.themePreset}&rdquo; · primary {settings.primaryColor}
              {settings.themePrimaryOverride ? " (overriding the preset)" : " (preset colour in use)"}
            </p>
          </div>
        </header>

        <Section title="Palette">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch label="Primary" className="bg-primary" />
            <Swatch label="Card" className="bg-card" />
            <Swatch label="Muted" className="bg-muted" />
            <Swatch label="Foreground" className="bg-foreground" />
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary action</Button>
            <Button variant="outline">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline" size="sm">
              <Icon name="download" />
              With icon
            </Button>
          </div>
        </Section>

        <Section title="Typography">
          <h3 className="font-heading text-2xl">Heading — the quick brown fox</h3>
          <p className="mt-2 max-w-[60ch] text-base font-medium leading-relaxed text-foreground">
            Body copy at the size learners read lesson content in. If this is hard
            to read against the background, the theme is fighting the content.
          </p>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            Muted secondary text, used for metadata and hints.
          </p>
        </Section>

        <Section title="Badges">
          <div className="flex flex-wrap gap-2">
            <Badge color="var(--success)">Published</Badge>
            <Badge color="var(--muted)">Draft</Badge>
            <Badge color="var(--primary)">Primary</Badge>
            <Badge>Neutral</Badge>
          </div>
        </Section>

        <Section title="Generated branding assets">
          <div className="flex flex-wrap items-end gap-6">
            {assets.map((a) => (
              <div key={a.label} className="flex flex-col items-center gap-2">
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={a.label}
                    className={`${a.size} w-auto rounded border-2 border-border bg-card object-contain`}
                  />
                ) : (
                  <div
                    className={`${a.size} flex min-w-16 items-center justify-center rounded border-2 border-dashed border-border px-2 text-[10px] font-bold text-muted-foreground`}
                  >
                    none
                  </div>
                )}
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {a.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs font-medium text-muted-foreground">
            The favicon, touch icon and social image are regenerated from the logo
            every time it is replaced.
          </p>
        </Section>
      </div>
    </div>
  );
}

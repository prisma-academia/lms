import { requireExistingTenant } from "@/lib/auth/tenant-page";
import { prisma } from "@/lib/db/client";
import { parseTenantSettings } from "@/lib/tenant/settings";
import {
  formatTenantAddress,
  formatTenantLocation,
} from "@/lib/tenant/landing";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import { TenantLandingShell } from "@/components/tenant/landing-shell";
import { LandingHero } from "@/components/tenant/landing-hero";
import { LandingAbout } from "@/components/tenant/landing-about";
import { LandingBenefits } from "@/components/tenant/landing-benefits";
import {
  LandingCourses,
  type LandingCourse,
} from "@/components/tenant/landing-courses";
import { LandingSteps } from "@/components/tenant/landing-steps";

export default async function TenantLandingPage() {
  const page = await requireExistingTenant();
  const tenantId = page.tenant!.id;

  const [row, courses] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        companyEmail: true,
        companyPhone: true,
        website: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        region: true,
        postalCode: true,
        country: true,
        settingsJson: true,
      },
    }),
    prisma.course.findMany({
      where: { status: "PUBLISHED", visibility: "PUBLIC" },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: {
        id: true,
        title: true,
        description: true,
        priceCents: true,
        currency: true,
        thumbnailKey: true,
        _count: { select: { lessons: true } },
      },
    }),
  ]);

  if (!row) return null;

  const settings = parseTenantSettings(row.settingsJson);
  const logoUrl =
    settings.logoKey && s3Configured()
      ? publicUrlForKey(settings.logoKey)
      : null;
  const location = formatTenantLocation(row.city, row.country, settings.locale);
  const addressLines = formatTenantAddress(
    {
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      region: row.region,
      postalCode: row.postalCode,
      country: row.country,
    },
    settings.locale
  );

  const landingCourses: LandingCourse[] = courses.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    priceCents: c.priceCents,
    currency: c.currency,
    thumbnailUrl:
      c.thumbnailKey && s3Configured() ? publicUrlForKey(c.thumbnailKey) : null,
    lessonCount: c._count.lessons,
  }));

  return (
    <TenantLandingShell orgName={row.name}>
      <main>
        <LandingHero
          name={row.name}
          logoUrl={logoUrl}
          accentColor={settings.primaryColor}
          location={location}
          hasCourses={landingCourses.length > 0}
        />
        <LandingAbout
          companyEmail={row.companyEmail}
          companyPhone={row.companyPhone}
          website={row.website}
          addressLines={addressLines}
        />
        <LandingBenefits />
        <LandingCourses courses={landingCourses} />
        <LandingSteps accentColor={settings.primaryColor} />
      </main>
    </TenantLandingShell>
  );
}

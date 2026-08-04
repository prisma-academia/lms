import { getTranslations } from "next-intl/server";
import { TenantMark } from "@/components/tenant-mark";
import { loadTenantBranding } from "@/lib/site/metadata";

export default async function MaintenancePage() {
  const t = await getTranslations("maintenance");
  // Reached on a tenant host whose tenant is suspended or archived, so the
  // tenant still resolves and its branding still applies.
  const branding = await loadTenantBranding();
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mb-5 flex flex-col items-center gap-2">
          <TenantMark
            logoUrl={branding?.logoUrl}
            name={branding?.name}
            fallback="cap"
            className="size-11"
            iconClassName="size-6"
          />
          {branding?.name ? (
            <span className="font-heading text-[15px] leading-tight">
              {branding.name}
            </span>
          ) : null}
        </div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-stone-600">{t("body")}</p>
      </div>
    </main>
  );
}

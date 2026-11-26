import { PageHeader, Card } from "@/components/shell";
import { requirePlatformPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";

export default async function PlatformSettingsPage() {
  await requirePlatformPage(PERMISSIONS.PLATFORM_SETTINGS_WRITE.key);
  return (
    <div>
      <PageHeader title="Platform settings" subtitle="How this installation is configured." />
      <Card>
        <h2 className="font-heading text-base leading-tight">Set when the platform is deployed</h2>
        <p className="mt-2 max-w-prose text-sm font-medium text-muted-foreground">
          Email delivery, the payment gateway, file storage and the AI model are configured in the
          server&rsquo;s environment, not on this page. To change one, update the deployment&rsquo;s
          environment variables and restart the application.
        </p>
        <p className="mt-3 max-w-prose text-sm font-medium text-muted-foreground">
          Each academy manages its own name, branding, locale and time zone from its own Settings
          page.
        </p>
      </Card>
    </div>
  );
}

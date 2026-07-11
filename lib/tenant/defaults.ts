import { prisma } from "@/lib/db/client";
import { parseTenantSettings, tenantSettingsSchema } from "@/lib/tenant/settings";

export async function getDefaultTenantSettings() {
  const row = await prisma.platformConfig.findUnique({
    where: { key: "default_tenant_settings" },
  });
  if (row?.valueJson) {
    return parseTenantSettings(row.valueJson);
  }
  return tenantSettingsSchema.parse({});
}

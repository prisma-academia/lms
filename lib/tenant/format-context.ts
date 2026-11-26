import { cache } from "react";
import { prisma } from "@/lib/db/client";
import { parseTenantSettings } from "@/lib/tenant/settings";
import type { FormatContext } from "@/lib/format";

/**
 * The academy's own locale and time zone, for formatting dates and money.
 *
 * Everything a person sees — a deadline, an invoice amount, "last signed in" —
 * is formatted with these, never with whatever the server or the browser
 * happens to be set to. That is what makes a date read the same on a phone in
 * Lagos as on the server that rendered it, and what stops a page that renders
 * in both places from rendering two different strings.
 *
 * One helper for the staff admin and the learner portal alike: both used to
 * repeat the same lookup-and-parse in every page.
 *
 * Server-only (it reads the database). A Client Component that shows dates is
 * handed the result as a prop and formats with it explicitly. `cache()` makes a
 * second call in the same request free, so a page and the components under it
 * can each ask without costing a query apiece.
 */
export type TenantFormat = { locale: string; timeZone: string } & FormatContext;

export const tenantFormatContext = cache(async (tenantId: string): Promise<TenantFormat> => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settingsJson: true },
  });
  const settings = parseTenantSettings(tenant?.settingsJson);
  return { locale: settings.locale, timeZone: settings.timezone };
});

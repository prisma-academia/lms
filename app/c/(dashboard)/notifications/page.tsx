import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { tenantFormatContext } from "../_lib/format-context";
import { NotificationsClient } from "./notifications-client";

export default async function NotificationsPage() {
  const actor = await requireClientPage();
  // Notifications load in the browser; the academy's locale and time zone go
  // down with the page so their dates read the same for everyone.
  const format = await tenantFormatContext(actor.tenantId);
  return (
    <div>
      <PageHeader title="Notifications" subtitle="What's new, and how you'd like to hear about it" />
      <NotificationsClient format={format} />
    </div>
  );
}

import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { NotificationsClient } from "./notifications-client";

export default async function NotificationsPage() {
  await requireClientPage();
  return (
    <div>
      <PageHeader title="Notifications" subtitle="Your alerts and delivery preferences." />
      <NotificationsClient />
    </div>
  );
}

import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { InboxClient } from "./inbox-client";

export default async function InboxPage() {
  await requireClientPage();
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Messages from your academy." />
      <InboxClient />
    </div>
  );
}

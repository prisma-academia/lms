import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { tenantFormatContext } from "../_lib/format-context";
import { InboxClient } from "./inbox-client";

export default async function InboxPage() {
  const actor = await requireClientPage();
  // Messages load in the browser; the academy's locale and time zone go down
  // with the page so their dates read the same for everyone.
  const format = await tenantFormatContext(actor.tenantId);
  return (
    <div>
      <PageHeader title="Inbox" subtitle="Messages from your academy" />
      <InboxClient format={format} />
    </div>
  );
}

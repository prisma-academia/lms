import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { tenantFormatContext } from "../_lib/format-context";
import { LibraryBrowse } from "./library-browse";

export default async function LearnerLibraryPage() {
  const actor = await requireClientPage();

  // Tag list for the filter chips. Tags are not sensitive on their own, and
  // the item list itself is access-filtered server-side.
  const tags = await prisma.libraryTag.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 40,
  });

  const { locale } = await tenantFormatContext(actor.tenantId);

  return (
    <div>
      <PageHeader title="Library" subtitle="Videos, documents and recordings shared with you" />
      <LibraryBrowse tags={tags} locale={locale} />
    </div>
  );
}

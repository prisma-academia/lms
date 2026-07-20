import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
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

  return (
    <div>
      <PageHeader title="Library" subtitle="Media shared with you." />
      <LibraryBrowse tags={tags} />
    </div>
  );
}

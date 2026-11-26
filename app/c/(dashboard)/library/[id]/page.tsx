import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { LibraryItemView } from "./item-view";

export default async function LearnerLibraryItemPage(ctx: { params: Promise<{ id: string }> }) {
  await requireClientPage();
  const { id } = await ctx.params;

  return (
    <div>
      {/* The item's own name is the page heading; it arrives with the item, in
          MediaDetail. This is only the way back. */}
      <PageHeader title="Library" backHref="/library" backLabel="All library items" />
      <LibraryItemView id={id} />
    </div>
  );
}

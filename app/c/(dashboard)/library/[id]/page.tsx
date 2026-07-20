import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { MediaDetail } from "./media-detail";

export default async function LearnerLibraryItemPage(ctx: { params: Promise<{ id: string }> }) {
  await requireClientPage();
  const { id } = await ctx.params;

  return (
    <div>
      <PageHeader title="Library" backHref="/library" backLabel="Back to library" />
      <MediaDetail id={id} />
    </div>
  );
}

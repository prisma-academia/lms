import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function TemplatesLoading() {
  return (
    <PageSkeleton label="Loading templates…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}

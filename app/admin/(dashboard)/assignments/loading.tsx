import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading assignments…" action>
      <RowsSkeleton rows={5} />
    </PageSkeleton>
  );
}

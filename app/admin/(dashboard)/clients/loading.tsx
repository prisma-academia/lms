import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading learners…" action>
      <RowsSkeleton rows={8} />
    </PageSkeleton>
  );
}

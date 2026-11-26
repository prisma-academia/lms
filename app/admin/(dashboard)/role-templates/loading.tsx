import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function RolesLoading() {
  return (
    <PageSkeleton label="Loading roles…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}

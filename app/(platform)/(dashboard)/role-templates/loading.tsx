import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function PlatformRolesLoading() {
  return (
    <PageSkeleton label="Loading roles…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}

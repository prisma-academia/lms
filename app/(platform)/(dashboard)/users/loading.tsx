import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function PlatformUsersLoading() {
  return (
    <PageSkeleton label="Loading users…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}

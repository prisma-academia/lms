import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function PlatformRoleLoading() {
  return (
    <PageSkeleton label="Loading role…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={8} />
      </div>
    </PageSkeleton>
  );
}

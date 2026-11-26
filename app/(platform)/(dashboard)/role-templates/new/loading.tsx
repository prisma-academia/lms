import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function NewPlatformRoleLoading() {
  return (
    <PageSkeleton label="Loading…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={8} />
      </div>
    </PageSkeleton>
  );
}

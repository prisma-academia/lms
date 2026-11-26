import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function PlatformSettingsLoading() {
  return (
    <PageSkeleton label="Loading settings…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={3} />
      </div>
    </PageSkeleton>
  );
}

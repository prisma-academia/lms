import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <PageSkeleton label="Loading settings…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={10} />
      </div>
    </PageSkeleton>
  );
}

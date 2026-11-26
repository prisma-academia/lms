import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function PlatformUserLoading() {
  return (
    <PageSkeleton label="Loading user…">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <CardSkeleton lines={7} />
        <CardSkeleton lines={9} />
      </div>
    </PageSkeleton>
  );
}

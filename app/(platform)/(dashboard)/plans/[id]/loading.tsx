import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function PlanLoading() {
  return (
    <PageSkeleton label="Loading plan…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={9} />
      </div>
    </PageSkeleton>
  );
}

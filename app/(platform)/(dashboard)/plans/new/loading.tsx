import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function NewPlanLoading() {
  return (
    <PageSkeleton label="Loading…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={9} />
      </div>
    </PageSkeleton>
  );
}

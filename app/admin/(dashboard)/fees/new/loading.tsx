import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function NewFeeLoading() {
  return (
    <PageSkeleton label="Loading…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={7} />
      </div>
    </PageSkeleton>
  );
}

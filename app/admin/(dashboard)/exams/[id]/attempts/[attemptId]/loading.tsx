import { CardGridSkeleton, CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function AttemptLoading() {
  return (
    <PageSkeleton label="Loading the attempt…">
      <div className="flex flex-col gap-5">
        <CardGridSkeleton cards={3} />
        <CardSkeleton lines={6} />
      </div>
    </PageSkeleton>
  );
}

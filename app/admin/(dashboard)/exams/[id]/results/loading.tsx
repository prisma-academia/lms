import { CardGridSkeleton, CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function ResultsLoading() {
  return (
    <PageSkeleton label="Loading results…">
      <div className="flex flex-col gap-5">
        <CardGridSkeleton cards={3} />
        <CardSkeleton lines={6} />
      </div>
    </PageSkeleton>
  );
}

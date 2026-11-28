import { CardGridSkeleton, CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function LiveLoading() {
  return (
    <PageSkeleton label="Loading the live room…">
      <div className="flex flex-col gap-5">
        <CardGridSkeleton cards={3} />
        <CardSkeleton lines={6} />
      </div>
    </PageSkeleton>
  );
}

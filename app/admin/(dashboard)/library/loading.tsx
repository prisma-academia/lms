import { CardGridSkeleton, CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function LibraryLoading() {
  return (
    <PageSkeleton label="Loading the library…">
      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="hidden flex-col gap-4 lg:flex">
          <CardSkeleton lines={2} />
          <CardSkeleton lines={5} />
        </div>
        <CardGridSkeleton cards={6} />
      </div>
    </PageSkeleton>
  );
}

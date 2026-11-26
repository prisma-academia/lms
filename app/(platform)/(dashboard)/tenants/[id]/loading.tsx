import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function AcademyLoading() {
  return (
    <PageSkeleton label="Loading academy…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={4} />
        <CardSkeleton lines={5} />
      </div>
    </PageSkeleton>
  );
}

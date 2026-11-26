import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function NewAcademyLoading() {
  return (
    <PageSkeleton label="Loading…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={10} />
      </div>
    </PageSkeleton>
  );
}

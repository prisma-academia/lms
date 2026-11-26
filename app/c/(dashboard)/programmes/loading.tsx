import { CardGridSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function ProgrammesLoading() {
  return (
    <PageSkeleton label="Loading programmes…">
      <CardGridSkeleton cards={4} className="lg:grid-cols-2" />
    </PageSkeleton>
  );
}

import { CardGridSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function MyCoursesLoading() {
  return (
    <PageSkeleton label="Loading your courses…" action>
      <CardGridSkeleton cards={4} className="lg:grid-cols-2" />
    </PageSkeleton>
  );
}

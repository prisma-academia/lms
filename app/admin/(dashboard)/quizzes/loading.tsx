import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function QuizzesLoading() {
  return (
    <PageSkeleton label="Loading quizzes…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}

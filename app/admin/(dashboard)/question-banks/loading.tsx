import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function QuestionBanksLoading() {
  return (
    <PageSkeleton label="Loading question banks…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}

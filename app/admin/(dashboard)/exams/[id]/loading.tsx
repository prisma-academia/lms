import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function ExamBuilderLoading() {
  return (
    <PageSkeleton label="Loading exam…" action>
      <CardSkeleton lines={6} />
    </PageSkeleton>
  );
}

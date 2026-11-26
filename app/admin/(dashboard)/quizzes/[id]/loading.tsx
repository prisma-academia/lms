import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function QuizLoading() {
  return (
    <PageSkeleton label="Loading quiz…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={5} />
        <CardSkeleton lines={3} />
      </div>
    </PageSkeleton>
  );
}

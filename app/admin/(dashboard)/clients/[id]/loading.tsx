import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading this learner…">
      <div className="grid gap-4">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={5} />
      </div>
    </PageSkeleton>
  );
}

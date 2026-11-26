import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading this assignment…">
      <div className="grid gap-4">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
    </PageSkeleton>
  );
}

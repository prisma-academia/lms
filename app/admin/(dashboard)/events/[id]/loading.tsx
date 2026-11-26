import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading this event…">
      <div className="grid gap-4">
        <CardSkeleton lines={8} />
      </div>
    </PageSkeleton>
  );
}

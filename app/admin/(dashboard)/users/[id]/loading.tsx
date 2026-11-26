import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading this user…">
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={6} />
      </div>
    </PageSkeleton>
  );
}

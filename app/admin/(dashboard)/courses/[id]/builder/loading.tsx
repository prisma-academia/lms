import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading the course builder…">
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={8} />
        <CardSkeleton lines={8} />
      </div>
    </PageSkeleton>
  );
}

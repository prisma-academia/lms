import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading the form…">
      <div className="grid gap-4">
        <CardSkeleton lines={4} />
      </div>
    </PageSkeleton>
  );
}

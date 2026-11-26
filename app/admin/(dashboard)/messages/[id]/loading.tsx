import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading this message…">
      <div className="grid gap-4">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={2} />
      </div>
    </PageSkeleton>
  );
}

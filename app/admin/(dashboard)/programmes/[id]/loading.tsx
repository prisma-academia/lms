import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageSkeleton label="Loading this programme…">
      <div className="grid gap-4">
        <CardSkeleton lines={7} />
        <CardSkeleton lines={5} />
      </div>
    </PageSkeleton>
  );
}

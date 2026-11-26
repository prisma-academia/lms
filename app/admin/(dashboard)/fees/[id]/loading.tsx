import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function FeeLoading() {
  return (
    <PageSkeleton label="Loading fee…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={5} />
      </div>
    </PageSkeleton>
  );
}

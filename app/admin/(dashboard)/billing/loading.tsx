import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function BillingLoading() {
  return (
    <PageSkeleton label="Loading billing…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={6} />
      </div>
    </PageSkeleton>
  );
}

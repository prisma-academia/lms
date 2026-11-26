import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function ReferralsLoading() {
  return (
    <PageSkeleton label="Loading referrals…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={3} />
        <CardSkeleton lines={6} />
      </div>
    </PageSkeleton>
  );
}

import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function InviteUserLoading() {
  return (
    <PageSkeleton label="Loading…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={6} />
      </div>
    </PageSkeleton>
  );
}

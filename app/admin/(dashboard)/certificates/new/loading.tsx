import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function NewCertificateLoading() {
  return (
    <PageSkeleton label="Loading…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={4} />
      </div>
    </PageSkeleton>
  );
}

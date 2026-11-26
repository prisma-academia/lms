import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function CertificateLoading() {
  return (
    <PageSkeleton label="Loading certificate…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={3} />
        <CardSkeleton lines={8} />
        <CardSkeleton lines={4} />
      </div>
    </PageSkeleton>
  );
}

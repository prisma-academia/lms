import { PageSkeleton, RowsSkeleton } from "@/components/ui/skeleton";

export default function CertificatesLoading() {
  return (
    <PageSkeleton label="Loading certificates…" action>
      <RowsSkeleton />
    </PageSkeleton>
  );
}

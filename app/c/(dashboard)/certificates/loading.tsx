import { CardGridSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function CertificatesLoading() {
  return (
    <PageSkeleton label="Loading your certificates…">
      <CardGridSkeleton cards={4} className="lg:grid-cols-2" />
    </PageSkeleton>
  );
}

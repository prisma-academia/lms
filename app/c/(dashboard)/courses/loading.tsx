import { CardGridSkeleton, PageSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function CatalogLoading() {
  return (
    <PageSkeleton label="Loading courses…">
      <Skeleton className="mb-6 h-11 w-full max-w-sm rounded-[10px]" />
      <CardGridSkeleton cards={6} />
    </PageSkeleton>
  );
}

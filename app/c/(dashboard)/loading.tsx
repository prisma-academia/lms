import { CardGridSkeleton, PageSkeleton } from "@/components/ui/skeleton";

/**
 * Shown while any learner page loads and has no `loading.tsx` of its own.
 * Learner pages are mostly cards (courses, tasks, certificates), so cards are
 * what is held open — the page does not jump when the real ones arrive.
 */
export default function ClientDashboardLoading() {
  return (
    <PageSkeleton>
      <CardGridSkeleton cards={4} className="lg:grid-cols-2" />
    </PageSkeleton>
  );
}

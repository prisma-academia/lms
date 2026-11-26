import { PageSkeleton } from "@/components/ui/skeleton";

/**
 * Shown while any admin page loads and has no `loading.tsx` of its own. Most
 * admin pages are a heading over a list, so that is the shape held open.
 */
export default function AdminDashboardLoading() {
  return <PageSkeleton action />;
}

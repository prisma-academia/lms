import { PageSkeleton } from "@/components/ui/skeleton";

/** Shown while any platform page loads and has no `loading.tsx` of its own. */
export default function PlatformDashboardLoading() {
  return <PageSkeleton action />;
}

"use client";

import { RouteError } from "@/components/route-error";

// Catches failures thrown by app/admin/(dashboard)/layout.tsx and other admin
// segment layouts, which a same-segment error.tsx cannot catch.
export default function AdminError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} title="Could not load this page" />;
}

"use client";

import { RouteError } from "@/components/route-error";

export default function AdminSetupError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} title="Could not load this page" />;
}

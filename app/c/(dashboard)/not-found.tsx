import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ClientNotFound() {
  return (
    <div className="flex flex-col gap-4 py-8">
      <h1 className="font-heading text-2xl">Page not found</h1>
      <p className="max-w-md text-sm font-medium text-ink/70">
        This page does not exist or is no longer available to you.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link href="/c/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

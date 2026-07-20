import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ClientAreaNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
        <h1 className="font-heading text-2xl">Page not found</h1>
        <p className="text-sm font-medium text-muted-foreground">
          The page you requested could not be found.
        </p>
        <Button asChild variant="outline">
          <Link href="/c/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </main>
  );
}

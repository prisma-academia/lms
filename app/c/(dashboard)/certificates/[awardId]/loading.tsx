import { Skeleton } from "@/components/ui/skeleton";

/** Shaped like the certificate: a way back, the print button, one landscape sheet. */
export default function CertificateLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading your certificate…</span>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3" aria-hidden>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-44" />
      </div>
      <Skeleton className="mx-auto aspect-[1.414/1] w-full max-w-4xl rounded-[10px]" />
    </div>
  );
}

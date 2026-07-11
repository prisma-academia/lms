import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DataTableToolbar({
  title,
  createHref,
  createLabel = "Create",
  description,
}: {
  title: string;
  createHref?: string;
  createLabel?: string;
  description?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl leading-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm font-medium text-ink/60">{description}</p>
        ) : null}
      </div>
      {createHref ? (
        <Button asChild>
          <Link href={createHref}>{createLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

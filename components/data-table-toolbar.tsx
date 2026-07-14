import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell";

export function DataTableToolbar({
  title,
  createHref,
  createLabel = "Create",
  description,
  backHref,
  backLabel,
}: {
  title: string;
  createHref?: string;
  createLabel?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <PageHeader
      title={title}
      subtitle={description}
      backHref={backHref}
      backLabel={backLabel}
      action={
        createHref ? (
          <Button asChild>
            <Link href={createHref}>{createLabel}</Link>
          </Button>
        ) : undefined
      }
    />
  );
}

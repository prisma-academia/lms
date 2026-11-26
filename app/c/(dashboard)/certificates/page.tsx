import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/icon";
import { formatDate } from "@/lib/format";
import { tenantFormatContext } from "../_lib/format-context";
import { countOf } from "../_lib/labels";

export default async function ClientCertificatesPage() {
  const actor = await requireClientPage();
  const [awards, format] = await Promise.all([
    prisma.certificateAward.findMany({
      where: { clientId: actor.clientId },
      orderBy: { issuedAt: "desc" },
      include: { certificate: { select: { name: true, course: { select: { title: true } }, programme: { select: { title: true } } } } },
    }),
    tenantFormatContext(actor.tenantId),
  ]);

  return (
    <div>
      <PageHeader
        title="Certificates"
        subtitle={awards.length === 0 ? "Earned by finishing a course or programme" : `${countOf(awards.length, "certificate")} earned`}
      />
      {awards.length === 0 ? (
        <div className="rounded-[14px] border-2 border-border bg-card p-4 shadow-md">
          <EmptyState
            icon="award"
            title="No certificates yet"
            action={
              <Button asChild size="sm">
                <Link href="/my-courses">Go to my courses</Link>
              </Button>
            }
          >
            Finish a course that awards one and your certificate will be here to view, print or
            save.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {awards.map((a) => {
            const earnedFor = a.certificate.course?.title ?? a.certificate.programme?.title ?? null;
            return (
              <li key={a.id}>
                <Link
                  href={`/certificates/${a.id}`}
                  className="flex h-full items-start gap-3 rounded-[14px] border-2 border-border bg-card p-4 shadow-md outline-none transition-transform [touch-action:manipulation] hover:-translate-x-0.5 hover:-translate-y-0.5 focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border-2 border-border bg-warning text-warning-foreground"
                  >
                    <Icon name="award" className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="break-words font-heading text-lg leading-tight">{a.certificate.name}</span>
                    {earnedFor ? (
                      <span className="break-words text-sm font-medium text-muted-foreground">{earnedFor}</span>
                    ) : null}
                    <span className="mt-1 text-xs font-bold text-muted-foreground">
                      Awarded {formatDate(a.issuedAt, format)}
                      <span className="num font-medium"> · No. {a.serial}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

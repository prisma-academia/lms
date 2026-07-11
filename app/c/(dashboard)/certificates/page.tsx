import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { PageHeader } from "@/components/shell";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ClientCertificatesPage() {
  const actor = await requireClientPage();
  const awards = await prisma.certificateAward.findMany({
    where: { clientId: actor.clientId },
    orderBy: { issuedAt: "desc" },
    include: { certificate: { select: { name: true, course: { select: { title: true } }, programme: { select: { title: true } } } } },
  });

  return (
    <div>
      <PageHeader title="Certificates" subtitle={`${awards.length} earned`} />
      {awards.length === 0 ? (
        <div className="rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal">
          <EmptyState icon="award" title="No certificates yet">
            Complete a course to earn a certificate.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {awards.map((a) => (
            <li key={a.id}>
              <Link
                href={`/certificates/${a.id}`}
                className="flex flex-col gap-1 rounded-[14px] border-2 border-ink bg-card p-4 shadow-brutal transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
              >
                <span className="font-heading text-lg">{a.certificate.name}</span>
                <span className="text-sm text-ink/60">
                  {a.certificate.course?.title ?? a.certificate.programme?.title ?? "—"}
                </span>
                <span className="mt-1 text-xs font-bold text-ink/50">
                  {a.serial} · {new Date(a.issuedAt).toLocaleDateString()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

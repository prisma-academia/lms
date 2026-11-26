import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireTenantPage } from "@/lib/auth/page-guards";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PageHeader, Card } from "@/components/shell";
import { formatDate, formatDateTime } from "@/lib/format";
import { parseClientProfile } from "@/lib/schemas/client-profile";
import { staffAvatarSrc } from "@/lib/profile/files";
import { ClientResetPasswordAction } from "./reset-action";
import { ClientProfileView } from "./client-profile-view";
import { tenantFormatContext } from "@/lib/tenant/format-context";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const actor = await requireTenantPage(PERMISSIONS.TENANT_CLIENTS_READ.key);
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client || client.tenantId !== actor.tenantId) notFound();

  const [formatContext, awards] = await Promise.all([
    tenantFormatContext(actor.tenantId),
    prisma.certificateAward.findMany({
      where: { clientId: client.id },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        serial: true,
        issuedAt: true,
        certificate: {
          select: { name: true, course: { select: { title: true } }, programme: { select: { title: true } } },
        },
      },
    }),
  ]);

  // Never throws: whatever an older release stored still reads as a profile.
  const profile = parseClientProfile(client.profileJson);
  const fullName = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim();
  const title = fullName || profile.displayName || client.email;

  const account: { label: string; value: string }[] = [
    { label: "Email", value: client.email },
    // Shown when it differs from the name on record, since it is what the
    // learner sees themselves called.
    ...(profile.displayName && profile.displayName !== fullName
      ? [{ label: "Display name", value: profile.displayName }]
      : []),
    { label: "First name", value: client.firstName ?? "—" },
    { label: "Last name", value: client.lastName ?? "—" },
    { label: "Other name", value: client.otherName ?? "—" },
    { label: "Phone", value: client.phone ?? "—" },
    { label: "Status", value: client.status.charAt(0) + client.status.slice(1).toLowerCase() },
    { label: "Joined", value: formatDateTime(client.createdAt, formatContext) },
    { label: "Last signed in", value: formatDateTime(client.lastLoginAt, formatContext, "Never") },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} backHref="/admin/clients" backLabel="Learners" />
      <Card>
        <h2 className="font-heading text-lg leading-tight">Account</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {account.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs font-bold text-muted-foreground">{row.label}</dt>
              <dd className="break-words font-medium text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
        <ClientResetPasswordAction clientId={client.id} />
      </Card>

      <ClientProfileView
        clientId={client.id}
        profile={profile}
        avatarSrc={staffAvatarSrc(client.id, profile)}
        issued={awards.map((award) => ({
          id: award.id,
          name: award.certificate.name,
          earnedOn: award.certificate.course?.title ?? award.certificate.programme?.title ?? null,
          serial: award.serial,
          issuedLabel: formatDate(award.issuedAt, formatContext),
        }))}
      />
    </div>
  );
}

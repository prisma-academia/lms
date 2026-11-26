import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { requireClientPage } from "@/lib/auth/page-guards";
import { parseTenantSettings } from "@/lib/tenant/settings";
import { s3Configured } from "@/lib/storage/s3";
import { formatDate } from "@/lib/format";
import { parseClientProfile } from "@/lib/schemas/client-profile";
import { ownAvatarSrc } from "@/lib/profile/files";
import { ProfileEditor } from "./profile-editor";

export default async function ClientProfilePage() {
  const actor = await requireClientPage();
  const [client, tenant, awards] = await Promise.all([
    prisma.client.findUnique({
      where: { id: actor.clientId },
      select: { email: true, firstName: true, lastName: true, phone: true, profileJson: true },
    }),
    prisma.tenant.findUnique({ where: { id: actor.tenantId }, select: { settingsJson: true } }),
    // Certificates the academy issued: shown beside the learner's own, so they
    // never have to retype what was earned here.
    prisma.certificateAward.findMany({
      where: { clientId: actor.clientId },
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
  if (!client) redirect("/auth/login");

  // Never throws: a profile stored by an older release still opens here.
  const profile = parseClientProfile(client.profileJson);
  const settings = parseTenantSettings(tenant?.settingsJson);
  // Dates are turned into text here, once, in the academy's own locale and time
  // zone. The editor is a Client Component; formatting there would run twice,
  // on two machines, and need not agree.
  const formatContext = { locale: settings.locale, timeZone: settings.timezone };

  return (
    <ProfileEditor
      initialProfile={profile}
      initialAccount={{
        email: client.email,
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
      }}
      initialAvatarSrc={ownAvatarSrc(profile)}
      uploadsEnabled={s3Configured()}
      issued={awards.map((award) => ({
        id: award.id,
        name: award.certificate.name,
        earnedOn: award.certificate.course?.title ?? award.certificate.programme?.title ?? null,
        serial: award.serial,
        issuedLabel: formatDate(award.issuedAt, formatContext),
      }))}
    />
  );
}

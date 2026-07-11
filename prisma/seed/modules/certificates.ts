import { makeSerial } from "../../../lib/certificates/award";
import { certificateDesignSchema } from "../../../lib/certificates/design";
import { DAY, type SeedContext } from "../index";

export async function seedCertificates(ctx: SeedContext): Promise<void> {
  const { prisma, tenantId, now } = ctx;
  const clientId = ctx.ids.clientId;

  const designCourse = ctx.ids.courseBySlug["graphic-design-social"];
  if (!designCourse) return;

  const design = certificateDesignSchema.parse({
    title: "Certificate of Completion",
    subtitle: "Greenfield Academy Lagos proudly presents this to",
    bodyText:
      "for successfully completing {{courseTitle}} on {{date}}, demonstrating skill in social media design for Nigerian brands.",
    accentColor: "#8C6BFF",
    footerText: "Certificate no. {{serial}} · Verified by Greenfield Academy",
  });

  const cert = await prisma.certificate.create({
    data: {
      tenantId,
      name: "Graphic Design for Social Media — Completion",
      courseId: designCourse.courseId,
      contentJson: design as object,
    },
  });
  ctx.ids.certificateId = cert.id;

  await prisma.certificateAward.create({
    data: {
      tenantId,
      certificateId: cert.id,
      clientId,
      courseId: designCourse.courseId,
      serial: makeSerial(),
      issuedAt: new Date(now - 5 * DAY),
    },
  });
}

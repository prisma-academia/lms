import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { audit, requestMeta } from "@/lib/auth/audit";
import { enforceRateLimit, type RateLimitPreset } from "@/lib/auth/rate-limit";
import { aiDomainError, requireAiConfigured } from "@/lib/ai/http";
import { parseDesign } from "@/lib/certificates/design";
import { certificateBranding } from "@/lib/certificates/branding";
import { certificateSampleContext } from "@/lib/certificates/variables";
import { certificateDesignRequestSchema, designCertificate } from "@/lib/certificates/ai";
import { renderCertificatePreview } from "@/lib/certificates/render-html";

/**
 * Design a certificate with AI, or revise the one in the editor.
 *
 * Returns a certificate; it never saves one. What comes back has been cleaned
 * and checked, and is rendered for preview through the same pipeline a
 * learner's certificate goes through — but it only becomes the certificate when
 * a person presses Apply in the editor and then Save.
 */

// Up to two model calls (the design, then one correction if it needs it).
export const maxDuration = 180;

/** The action each request is recorded under. Also what the spend cap counts. */
const AUDIT_ACTION = "certificate.ai_design";

/**
 * How many designs one academy may ask for.
 *
 * Counted from the audit log rather than a rate limiter, for the same reason
 * the essay grader's cap is: the limiter fails open when it is not configured,
 * which is right for sign-in and wrong for anything that costs money per call.
 */
const MAX_PER_HOUR = 30;
const MAX_PER_DAY = 120;

/** A second, tighter brake per person, where a rate limiter is configured. */
const PER_USER: RateLimitPreset = { name: "certificate-design", limit: 12, windowSeconds: 10 * 60 };

const Body = z.object({
  request: certificateDesignRequestSchema,
  /** The accent colour currently set in the editor, so the preview matches it. */
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

async function enforceBudget(tenantId: string): Promise<void> {
  const now = Date.now();
  const [hour, day] = await Promise.all([
    prisma.activityLog.count({
      where: { tenantId, action: AUDIT_ACTION, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    }),
    prisma.activityLog.count({
      where: { tenantId, action: AUDIT_ACTION, createdAt: { gte: new Date(now - 24 * 60 * 60 * 1000) } },
    }),
  ]);
  if (hour >= MAX_PER_HOUR) {
    throw new DomainError(
      429,
      "ai_budget",
      "Your academy has asked for a lot of AI designs in the last hour. Try again in a little while."
    );
  }
  if (day >= MAX_PER_DAY) {
    throw new DomainError(
      429,
      "ai_budget",
      "Your academy has reached today's limit for AI certificate designs. It resets over the next 24 hours."
    );
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_CERTIFICATES_WRITE.key);
    const { id } = await ctx.params;
    const body = Body.parse(await request.json());

    const certificate = await prisma.certificate.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true, name: true, courseId: true, programmeId: true, contentJson: true },
    });
    if (!certificate) throw new DomainError(404, "not_found", "Certificate not found.");

    requireAiConfigured();
    await enforceRateLimit(PER_USER, [actor.userId]);
    await enforceBudget(actor.tenantId);

    // Recorded BEFORE the call: a request that fails halfway has still been
    // paid for, and the cap above has to see requests that are in flight.
    const meta = requestMeta(request);
    await audit({
      actorType: "TENANT_USER",
      actorId: actor.userId,
      action: AUDIT_ACTION,
      tenantId: actor.tenantId,
      targetType: "Certificate",
      targetId: certificate.id,
      after: { mode: body.request.mode },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const branding = await certificateBranding(actor.tenantId);

    // Lazy import keeps the Mastra instance (native storage deps) out of the
    // module graph until AI is actually used.
    const { getMastra } = await import("@/src/mastra");

    let result;
    try {
      const mastra = await getMastra();
      result = await designCertificate(mastra.getAgent("certificateDesignerAgent"), body.request, {
        tenantName: branding.name,
        hasLogo: Boolean(branding.logoUrl),
        certificateName: certificate.name,
        awardedFor: certificate.courseId ? "course" : certificate.programmeId ? "programme" : null,
      });
    } catch (e) {
      throw aiDomainError(e, "certificate_design");
    }

    // Real branding, sample award — the same picture the editor's preview shows.
    const accentColor = body.accentColor ?? parseDesign(certificate.contentJson).accentColor;
    const preview = renderCertificatePreview(
      result.html,
      certificateSampleContext({
        tenantName: branding.name,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        accentColor,
      }),
      `cert-ai-${certificate.id}`
    );

    return ok({ html: result.html, preview, report: result.report, attempts: result.attempts });
  } catch (e) {
    return handleError(e);
  }
}

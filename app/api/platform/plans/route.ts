import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requirePlatformActor, PERMISSIONS } from "@/lib/auth/guards";
import { audit, requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError, DomainError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const CreateBody = z.object({
  code: z.string().min(1).max(60).regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, - and _ only."),
  name: z.string().min(1).max(120),
  priceMonthlyCents: z.number().int().min(0),
  currency: z.string().length(3).optional(),
  storageQuotaBytes: z.number().int().min(0),
  maxLearners: z.number().int().min(0).nullable().optional(),
  maxInstructors: z.number().int().min(0).nullable().optional(),
  maxCourses: z.number().int().min(0).nullable().optional(),
  isPublic: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// SubscriptionPlan.storageQuotaBytes is BigInt — JSON can't serialize it.
function serialize(p: { storageQuotaBytes: bigint } & Record<string, unknown>) {
  return { ...p, storageQuotaBytes: p.storageQuotaBytes.toString() };
}

export async function GET() {
  try {
    await requirePlatformActor(PERMISSIONS.PLATFORM_PLANS_READ.key);
    const plans = await prisma.subscriptionPlan.findMany({ orderBy: { sortOrder: "asc" } });
    return ok({ plans: plans.map(serialize) });
  } catch (e) {
    return handleError(e);
  }
}

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requirePlatformActor(PERMISSIONS.PLATFORM_PLANS_WRITE.key);
    const body = CreateBody.parse(await request.json());
    const meta = requestMeta(request);

    const existing = await prisma.subscriptionPlan.findUnique({ where: { code: body.code } });
    if (existing) throw new DomainError(409, "code_taken", "A plan with that code already exists.");

    const plan = await prisma.subscriptionPlan.create({
      data: {
        code: body.code,
        name: body.name,
        priceMonthlyCents: body.priceMonthlyCents,
        currency: body.currency ?? "NGN",
        storageQuotaBytes: BigInt(body.storageQuotaBytes),
        maxLearners: body.maxLearners ?? null,
        maxInstructors: body.maxInstructors ?? null,
        maxCourses: body.maxCourses ?? null,
        isPublic: body.isPublic ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
    });
    await audit({
      actorType: "PLATFORM_USER",
      actorId: actor.userId,
      action: "subscription_plan.create",
      tenantId: null,
      targetType: "SubscriptionPlan",
      targetId: plan.id,
      after: { code: plan.code, name: plan.name } as object,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return ok({ plan: serialize(plan) }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}

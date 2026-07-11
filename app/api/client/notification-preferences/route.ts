import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { requireClientActor } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";

const CATEGORIES = ["MESSAGE", "ANNOUNCEMENT", "REMINDER"] as const;

export async function GET() {
  try {
    const actor = await requireClientActor();
    const rows = await prisma.notificationPreference.findMany({ where: { clientId: actor.clientId } });
    const byCat = new Map(rows.map((r) => [r.category, r]));
    const prefs = CATEGORIES.map((category) => ({
      category,
      inApp: byCat.get(category)?.inApp ?? true,
      email: byCat.get(category)?.email ?? true,
    }));
    return ok({ prefs });
  } catch (e) {
    return handleError(e);
  }
}

const SaveBody = z.object({
  prefs: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        inApp: z.boolean(),
        email: z.boolean(),
      })
    )
    .max(10),
});

export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireClientActor();
    const { prefs } = SaveBody.parse(await request.json());
    await prisma.$transaction(
      prefs.map((p) =>
        prisma.notificationPreference.upsert({
          where: { clientId_category: { clientId: actor.clientId, category: p.category } },
          create: { tenantId: actor.tenantId, clientId: actor.clientId, category: p.category, inApp: p.inApp, email: p.email },
          update: { inApp: p.inApp, email: p.email },
        })
      )
    );
    return ok({ saved: true });
  } catch (e) {
    return handleError(e);
  }
}

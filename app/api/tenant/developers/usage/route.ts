import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";

/** Requests and errors per UTC day for the last `days` (7–90, default 30), optionally one key. */
export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_READ.key);
    const sp = new URL(request.url).searchParams;
    const days = Math.min(90, Math.max(7, Number(sp.get("days")) || 30));
    const keyId = sp.get("keyId");
    const today = new Date();
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (days - 1)));
    const rows = await prisma.apiUsage.findMany({
      where: { tenantId: actor.tenantId, period: "DAY", bucket: { gte: start }, ...(keyId ? { apiKeyId: keyId } : {}) },
      select: { bucket: true, count: true, errorCount: true },
    });
    const byDay = new Map<string, { count: number; errors: number }>();
    for (const r of rows) {
      const k = r.bucket.toISOString().slice(0, 10);
      const cur = byDay.get(k) ?? { count: 0, errors: 0 };
      cur.count += r.count;
      cur.errors += r.errorCount;
      byDay.set(k, cur);
    }
    const series = Array.from({ length: days }, (_, i) => {
      const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const v = byDay.get(d) ?? { count: 0, errors: 0 };
      return { date: d, requests: v.count, errors: v.errors };
    });
    return ok({ days, series });
  } catch (e) {
    return handleError(e);
  }
}

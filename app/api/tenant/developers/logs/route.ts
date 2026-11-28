import { prisma } from "@/lib/db/client";
import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * API request log (30 days), newest first, 50 per page.
 *   ?keyId=  ?status=2xx|4xx|5xx|<exact>  ?path=<substring>  ?cursor=
 */
export async function GET(request: Request) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_READ.key);
    const sp = new URL(request.url).searchParams;
    const where: Prisma.ApiRequestLogWhereInput = { tenantId: actor.tenantId };
    const keyId = sp.get("keyId");
    if (keyId) where.apiKeyId = keyId;
    const status = sp.get("status")?.trim() ?? "";
    const klass = /^([1-5])xx$/i.exec(status);
    if (klass) where.status = { gte: Number(klass[1]) * 100, lt: Number(klass[1]) * 100 + 100 };
    else if (/^\d{3}$/.test(status)) where.status = Number(status);
    const path = sp.get("path")?.trim().slice(0, 200);
    if (path) where.path = { contains: path, mode: "insensitive" };
    const cursor = sp.get("cursor");
    const rows = await prisma.apiRequestLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 51,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: { apiKey: { select: { name: true, prefix: true } } },
    });
    const more = rows.length > 50;
    const page = more ? rows.slice(0, 50) : rows;
    return ok(
      page.map((r) => ({
        id: r.id,
        requestId: r.requestId,
        method: r.method,
        path: r.path,
        query: r.query,
        status: r.status,
        durationMs: r.durationMs,
        errorCode: r.errorCode,
        ip: r.ip,
        userAgent: r.userAgent,
        createdAt: r.createdAt.toISOString(),
        keyId: r.apiKeyId,
        keyName: r.apiKey.name,
        keyPrefix: r.apiKey.prefix,
      })),
      { nextCursor: more ? (page[page.length - 1]?.id ?? null) : null }
    );
  } catch (e) {
    return handleError(e);
  }
}

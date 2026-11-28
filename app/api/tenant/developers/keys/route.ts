import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { requestMeta } from "@/lib/auth/audit";
import { ok } from "@/lib/api/respond";
import { handleError } from "@/lib/api/errors";
import { requireCsrf } from "@/lib/api/csrf-guard";
import { createKey, KeyCreate, listKeys } from "@/lib/developers/admin";

export async function GET() {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_READ.key);
    return ok({ keys: await listKeys(actor.tenantId) });
  } catch (e) {
    return handleError(e);
  }
}

/** Create a key. The full key is in this response and nowhere else, ever. */
export async function POST(request: Request) {
  try {
    await requireCsrf(request);
    const actor = await requireTenantActor(PERMISSIONS.TENANT_DEVELOPERS_WRITE.key);
    const body = KeyCreate.parse(await request.json());
    const { key, view } = await createKey({ userId: actor.userId, tenantId: actor.tenantId, ...requestMeta(request) }, body);
    return ok({ key, apiKey: view }, undefined, 201);
  } catch (e) {
    return handleError(e);
  }
}

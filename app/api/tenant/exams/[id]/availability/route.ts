import { requireTenantActor, PERMISSIONS } from "@/lib/auth/guards";
import { ok } from "@/lib/api/respond";
import { DomainError, handleError } from "@/lib/api/errors";
import { assertBanksAccessible, draftRuleAvailability, findExam, paperAvailability } from "@/lib/exams/admin";
import { poolRuleSchema } from "@/lib/exams/settings";

/**
 * How many questions each random pool can draw, the estimated total and what
 * would stop the paper being drawn.
 *
 * `?draft=<json pool rule>` counts one rule that is still being edited, so the
 * builder can show "12 questions match" before it is saved.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireTenantActor(PERMISSIONS.TENANT_EXAMS_READ.key);
    const { id } = await ctx.params;
    await findExam(actor.tenantId, id);

    const draft = new URL(request.url).searchParams.get("draft");
    if (draft) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(draft);
      } catch {
        throw new DomainError(400, "invalid_draft", "The pool rule could not be read.");
      }
      const rule = poolRuleSchema.parse(parsed);
      await assertBanksAccessible(actor, [rule.bankId]);
      return ok({ available: await draftRuleAvailability(id, rule) });
    }
    return ok(await paperAvailability(id));
  } catch (e) {
    return handleError(e);
  }
}

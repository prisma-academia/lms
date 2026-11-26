/**
 * The academy's locale and time zone for learner pages.
 *
 * The helper itself now lives in `lib/tenant/format-context.ts`, shared with
 * the staff admin; this file stays so the learner pages that already import it
 * from here keep working.
 */
export { tenantFormatContext, type TenantFormat } from "@/lib/tenant/format-context";

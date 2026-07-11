import { addDays } from "date-fns";
import { env } from "@/lib/env";

export const DEFAULT_STORAGE_QUOTA_BYTES = BigInt(10 * 1024 * 1024 * 1024); // 10 GB

export function trialEndsAtFromNow(): Date {
  return addDays(new Date(), env.TENANT_TRIAL_DAYS);
}

export function tenantCreateDefaults() {
  return {
    plan: "TRIAL" as const,
    trialEndsAt: trialEndsAtFromNow(),
    storageQuotaBytes: DEFAULT_STORAGE_QUOTA_BYTES,
    storageUsedBytes: BigInt(0),
    subscriptionStatus: "NONE" as const,
  };
}

import type { TenantPlan, SubscriptionStatus } from "@/lib/generated/prisma/client";

type TenantBilling = {
  plan: TenantPlan;
  trialEndsAt: Date | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: Date | null;
};

export function daysUntilTrialEnd(trialEndsAt: Date | null): number | null {
  if (!trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function isTrialExpired(tenant: TenantBilling): boolean {
  if (tenant.plan !== "TRIAL") return false;
  if (!tenant.trialEndsAt) return false;
  return tenant.trialEndsAt.getTime() < Date.now();
}

export function isSubscriptionPastDue(tenant: TenantBilling): boolean {
  if (tenant.subscriptionStatus !== "PAST_DUE") return false;
  if (!tenant.subscriptionEndsAt) return true;
  const graceMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() > tenant.subscriptionEndsAt.getTime() + graceMs;
}

export function isTenantBillingBlocked(tenant: TenantBilling): boolean {
  if (isTrialExpired(tenant) && tenant.subscriptionStatus === "NONE") return true;
  if (tenant.subscriptionStatus === "PAST_DUE" && isSubscriptionPastDue(tenant)) return true;
  if (tenant.subscriptionStatus === "CANCELLED" && tenant.plan !== "ACTIVE") return true;
  return false;
}

export function formatBytes(bytes: bigint): string {
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function storageUsagePercent(used: bigint, quota: bigint): number {
  if (quota <= BigInt(0)) return 100;
  return Math.min(100, Math.round((Number(used) / Number(quota)) * 100));
}

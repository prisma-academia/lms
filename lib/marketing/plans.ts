import type { SubscriptionPlan } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { formatBytes } from "@/lib/tenant/plan";

const ACCENTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export type MarketingPlanCard = {
  id: string;
  name: string;
  price: string;
  period: string;
  storage: string;
  accent: string;
  description: string;
  features: string[];
  highlighted: boolean;
  ctaLabel: string;
};

function formatLimit(value: number | null, label: string): string {
  if (value === null) return `Unlimited ${label}`;
  return `Up to ${value.toLocaleString()} ${label}`;
}

function formatPrice(plan: SubscriptionPlan): { price: string; period: string } {
  if (plan.priceMonthlyCents === 0) {
    return { price: "Custom", period: "" };
  }
  return {
    price: (plan.priceMonthlyCents / 100).toLocaleString(undefined, {
      style: "currency",
      currency: plan.currency,
      maximumFractionDigits: 0,
    }),
    period: "/mo",
  };
}

function planFeatures(plan: SubscriptionPlan): string[] {
  const features = [
    formatLimit(plan.maxLearners, "learners"),
    formatLimit(plan.maxInstructors, "staff"),
    formatLimit(plan.maxCourses, "courses"),
    `${formatBytes(plan.storageQuotaBytes)} storage`,
  ];
  if (plan.code === "enterprise") {
    features.push("Dedicated support");
  }
  return features;
}

function planDescription(plan: SubscriptionPlan): string {
  switch (plan.code) {
    case "starter":
      return "For organizations launching their first catalog.";
    case "growth":
      return "For established providers with larger audiences.";
    case "enterprise":
      return "For large deployments with dedicated needs.";
    default:
      return "Flexible plan for your organization.";
  }
}

export function toMarketingPlanCard(
  plan: SubscriptionPlan,
  index: number,
  highlighted: boolean
): MarketingPlanCard {
  const { price, period } = formatPrice(plan);
  return {
    id: plan.id,
    name: plan.name,
    price,
    period,
    storage: formatBytes(plan.storageQuotaBytes),
    accent: ACCENTS[index % ACCENTS.length],
    description: planDescription(plan),
    features: planFeatures(plan),
    highlighted,
    ctaLabel: plan.code === "enterprise" ? "Contact us" : "Get started",
  };
}

export async function getPublicMarketingPlans(): Promise<MarketingPlanCard[]> {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isPublic: true },
    orderBy: { sortOrder: "asc" },
  });

  const highlightIndex =
    plans.length >= 2 ? 1 : plans.length === 1 ? 0 : -1;

  return plans.map((plan, index) =>
    toMarketingPlanCard(plan, index, index === highlightIndex)
  );
}

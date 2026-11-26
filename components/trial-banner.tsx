import Link from "next/link";
import { daysUntilTrialEnd } from "@/lib/tenant/plan";
import { Icon } from "@/components/icon";

export function TrialBanner({
  plan,
  trialEndsAt,
  subscriptionStatus,
}: {
  plan: string;
  trialEndsAt: Date | null;
  subscriptionStatus: string;
}) {
  if (plan !== "TRIAL" || subscriptionStatus !== "NONE") return null;
  const days = daysUntilTrialEnd(trialEndsAt);
  if (days == null) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-[14px] border-2 border-border bg-warning px-4 py-3 text-sm font-bold text-warning-foreground shadow-sm">
      <Icon name="clock" className="size-4 shrink-0" />
      {days === 0 ? (
        <span>Your trial ends today.</span>
      ) : (
        <span>
          {days} day{days === 1 ? "" : "s"} left in your trial.
        </span>
      )}
      <Link
        href="/admin/billing"
        className="rounded-[4px] underline decoration-2 underline-offset-2 outline-none hover:decoration-wavy focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Upgrade your plan
      </Link>
    </div>
  );
}

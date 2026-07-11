import { rawPrisma as prisma } from "@/lib/db/raw-client";
import { revokeAllSessionsForTenant } from "@/lib/auth/session";

export async function expireTrials() {
  const now = new Date();
  const expired = await prisma.tenant.findMany({
    where: {
      plan: "TRIAL",
      trialEndsAt: { lt: now },
      subscriptionStatus: "NONE",
      status: "ACTIVE",
    },
    select: { id: true, name: true },
  });

  for (const tenant of expired) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "SUSPENDED" },
    });
    await revokeAllSessionsForTenant(tenant.id);
    await prisma.activityLog.create({
      data: {
        tenantId: tenant.id,
        actorType: "SYSTEM",
        action: "tenant.trial_expired",
        targetType: "Tenant",
        targetId: tenant.id,
      },
    });
  }
  return expired.length;
}

export async function sendTrialReminders(sendEmailFn: (input: { to: string; subject: string; html: string }) => Promise<void>) {
  const { trialReminderEmail } = await import("@/lib/email/templates");
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const tenants = await prisma.tenant.findMany({
    where: { plan: "TRIAL", subscriptionStatus: "NONE", status: "ACTIVE" },
    include: { users: { where: { isOwner: true }, take: 1 } },
  });

  let sent = 0;
  for (const tenant of tenants) {
    if (!tenant.trialEndsAt) continue;
    const daysLeft = Math.ceil((tenant.trialEndsAt.getTime() - now) / day);
    const owner = tenant.users[0];
    if (!owner) continue;

    const settings = (tenant.settingsJson ?? {}) as { onboarding?: { trialReminder7dSentAt?: string; trialReminder1dSentAt?: string } };
    const onboarding = settings.onboarding ?? {};

    if (daysLeft <= 7 && daysLeft > 6 && !onboarding.trialReminder7dSentAt) {
      await sendEmailFn({
        to: owner.email,
        subject: `${tenant.name}: 7 days left on your trial`,
        html: trialReminderEmail({ tenantName: tenant.name, daysLeft: 7 }),
      });
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          settingsJson: {
            ...settings,
            onboarding: { ...onboarding, trialReminder7dSentAt: new Date().toISOString() },
          },
        },
      });
      sent++;
    }
    if (daysLeft <= 1 && daysLeft >= 0 && !onboarding.trialReminder1dSentAt) {
      await sendEmailFn({
        to: owner.email,
        subject: `${tenant.name}: trial ends tomorrow`,
        html: trialReminderEmail({ tenantName: tenant.name, daysLeft: 1 }),
      });
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          settingsJson: {
            ...settings,
            onboarding: { ...onboarding, trialReminder1dSentAt: new Date().toISOString() },
          },
        },
      });
      sent++;
    }
  }
  return sent;
}

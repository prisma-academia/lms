import { ADMIN_RESET_LINK_HOURS, INVITE_LINK_DAYS, issueSetupLink } from "@/lib/auth/account-setup";
import type { EmailBranding } from "@/lib/email/branding";
import { sendEmail } from "@/lib/email/send";
import { accountSetupEmail, adminPasswordResetEmail } from "@/lib/email/templates";
import type { SessionUserType } from "@/lib/generated/prisma/client";

/**
 * The two emails that carry a "set your password" link.
 *
 * Neither throws when the mail server refuses the message. By the time these
 * run the account already exists, and failing the whole request would tell the
 * administrator "it didn't work" about something that did — after which a
 * second attempt is refused because the email is now taken. The caller gets
 * `sent: false` and says so; sending again later (the "reset password" action
 * on the person's page) issues a fresh link.
 */

type Target = {
  userType: SessionUserType;
  userId: string;
  tenantId: string | null;
  tenantSlug: string | null;
  branding: EmailBranding;
  to: string;
  name: string | null;
};

export async function sendInvitation(
  input: Target & {
    role: "owner" | "staff" | "platform";
    roleLabel?: string | null;
    invitedBy?: string | null;
  }
): Promise<{ sent: boolean }> {
  const link = await issueSetupLink({ ...input, kind: "invite" });
  const subject =
    input.role === "owner"
      ? `${input.branding.name} is ready: set your password`
      : input.role === "platform"
        ? `Your ${input.branding.name} administrator account`
        : `You're invited to join ${input.branding.name}`;
  try {
    await sendEmail({
      to: input.to,
      subject,
      replyTo: input.branding.isPlatform ? undefined : input.branding.supportEmail,
      fromName: input.branding.name,
      html: accountSetupEmail(input.branding, {
        name: input.name,
        email: input.to,
        setupUrl: link.url,
        role: input.role,
        roleLabel: input.roleLabel,
        invitedBy: input.invitedBy,
        expiresInDays: INVITE_LINK_DAYS,
      }),
    });
    return { sent: true };
  } catch {
    // sendEmail has already logged it.
    return { sent: false };
  }
}

export async function sendAdminReset(input: Target): Promise<{ sent: boolean }> {
  const link = await issueSetupLink({ ...input, kind: "admin_reset" });
  try {
    await sendEmail({
      to: input.to,
      subject: "Your password was reset",
      replyTo: input.branding.isPlatform ? undefined : input.branding.supportEmail,
      fromName: input.branding.name,
      html: adminPasswordResetEmail(input.branding, {
        name: input.name,
        email: input.to,
        setupUrl: link.url,
        expiresInHours: ADMIN_RESET_LINK_HOURS,
      }),
    });
    return { sent: true };
  } catch {
    return { sent: false };
  }
}

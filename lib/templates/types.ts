export const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  email_welcome: "Email — Welcome",
  email_invite: "Email — Invite",
  email_reset: "Email — Password reset",
  email_notification: "Email — Notification",
};

export function formatTemplateType(type: string): string {
  return TEMPLATE_TYPE_LABELS[type] ?? type.replace(/_/g, " ");
}

/**
 * Activity-log actions as a person would say them.
 *
 * Every audit entry carries a machine key such as `site_layout.update`. That
 * key is for filtering and for code; it is not a sentence, and showing it on
 * the academy's overview ("site_layout · update") reads like a leak from the
 * database. This is the one place keys become words, used by the admin
 * overview, the academy activity page and the platform console alike.
 *
 * Client-safe and pure: no imports.
 *
 * Two layers:
 *  - `ACTION_LABELS` for the actions whose natural wording is not the key
 *    rearranged ("Signed in", "Learner created");
 *  - a rule for everything else, so a new action added anywhere in the app is
 *    readable the day it ships, without anyone remembering to come here:
 *    `question_bank.delete` -> "Question bank deleted".
 */

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.client_login": "Learner signed in",
  "auth.client_signup": "Learner registered",
  "auth.logout": "Signed out",
  "auth.forgot_password": "Password reset requested",
  "auth.reset_password": "Password reset",
  "auth.change_password": "Password changed",
  "grade.create": "Grade recorded",
  "message.send": "Message sent",
  "certificate.award": "Certificate awarded",
  "certificate.ai_design": "Certificate designed with AI",
  "submission.create": "Submission received",
  "submission.grade": "Submission graded",
  "assignment.publish": "Assignment published",
  "enrollment.create": "Enrolment created",
  "course.enrolled": "Course purchased",
  "programme.enrolled": "Programme purchased",
  "library.purchased": "Library item purchased",
  "user.create": "Staff member invited",
  "user.update": "Staff member updated",
  "tenant_user.invite": "Staff member invited",
  "tenant_user.suspend": "Staff member suspended",
  "tenant_user.reset_password": "Staff password reset",
  "tenant_user.update_permissions": "Staff permissions changed",
  "tenant_user.apply_role": "Role applied to staff member",
  "platform_user.invite": "Platform user invited",
  "platform_user.reset_password": "Platform user password reset",
  "platform_user.update_permissions": "Platform user permissions changed",
  "platform_user.apply_role": "Role applied to platform user",
  "client.create": "Learner created",
  "client.update": "Learner updated",
  "client.reset_password": "Learner password reset",
  "client.profile_update": "Learner profile updated",
  "client.profile_document_view": "Learner document viewed",
  "client_group.set_members": "Learner group members changed",
  "user_group.set_members": "User group members changed",
  "tenant.create": "Academy created",
  "tenant.update": "Settings updated",
  "tenant.update_settings": "Settings updated",
  "tenant.profile_update": "Academy details updated",
  "tenant.self_register": "Academy registered",
  "tenant.set_favicon": "Favicon changed",
  "tenant.finalize_logo": "Logo changed",
  "tenant.extend_trial": "Trial extended",
  "tenant.trial_expired": "Trial ended",
  "tenant.activate_manual_plan": "Plan activated by hand",
  "tenant_role.create": "Role created",
  "tenant_role.update": "Role updated",
  "platform_role.create": "Platform role created",
  "platform_role.update": "Platform role updated",
  "billing.subscription_activated": "Subscription activated",
  "billing.payment_rejected": "Payment refused",
  "fee.record_payment": "Fee payment recorded",
  "programme.set_courses": "Programme courses changed",
  "programme.manual_enroll": "Learner enrolled in a programme",
  "library.upload_complete": "Library file uploaded",
  "library.grant": "Library access given",
  "library.revoke": "Library access removed",
  "library.folder_grant": "Library folder access given",
  "library.folder_revoke": "Library folder access removed",
  "lesson.complete.override": "Lesson marked complete by staff",
  "quiz.attempt_marked": "Quiz attempt marked by hand",
  "quiz.attempt_regraded": "Quiz attempt re-graded",
  "referral.code_created": "Referral code created",
  "referral.code_activated": "Referral code switched on",
  "referral.code_deactivated": "Referral code switched off",
  "site.ai_design": "Site page designed with AI",
  "site_layout.update": "Site header and footer updated",
  "site_template.create": "Site design saved",
  "site_template.delete": "Site design deleted",
};

/** The last word of a key, as something that has happened. */
const PAST: Record<string, string> = {
  create: "created",
  created: "created",
  update: "updated",
  updated: "updated",
  delete: "deleted",
  deleted: "deleted",
  publish: "published",
  unpublish: "unpublished",
  archive: "archived",
  restore: "restored",
  send: "sent",
  award: "awarded",
  grant: "granted",
  revoke: "revoked",
  invite: "invited",
  suspend: "suspended",
  activate: "activated",
  deactivate: "deactivated",
  enable: "switched on",
  disable: "switched off",
  approve: "approved",
  reject: "rejected",
  complete: "completed",
  submit: "submitted",
  grade: "graded",
  upload: "uploaded",
  import: "imported",
  export: "exported",
  enroll: "enrolled",
  enrol: "enrolled",
  login: "signed in",
  logout: "signed out",
};

function words(part: string): string {
  return part.replace(/[_-]+/g, " ").trim();
}

function sentence(text: string): string {
  const tidy = text.replace(/\s+/g, " ").trim();
  return tidy ? tidy[0].toUpperCase() + tidy.slice(1) : "";
}

/**
 * A readable label for an audit action. Never returns the raw key: an unknown
 * `thing_name.verb` becomes "Thing name verbed", and anything stranger is at
 * least spaced and capitalised.
 */
export function formatActivityAction(action: string | null | undefined): string {
  const key = (action ?? "").trim();
  if (!key) return "Activity";
  const known = ACTION_LABELS[key];
  if (known) return known;

  const parts = key.split(".").filter(Boolean);
  if (parts.length === 0) return "Activity";
  if (parts.length === 1) return sentence(words(parts[0]));

  const subject = words(parts.slice(0, -1).join(" "));
  const last = parts[parts.length - 1];
  const verb = PAST[last];
  // `quiz.attempt_marked`: the tail is already a phrase, so it is read as one.
  return sentence(verb ? `${subject} ${verb}` : `${subject} ${words(last)}`);
}

/** What an entry was about, in words: `SitePage` -> "Site page". */
export function formatActivityTarget(targetType: string | null, targetId: string | null): string {
  void targetId;
  if (!targetType) return "—";
  return sentence(targetType.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase());
}

/**
 * Tenant-scoping classification used by the Prisma client extension
 * (`lib/db/extension.ts`).
 *
 * - STRICT_SCOPED: models whose `tenantId` is non-nullable. Every query MUST be
 *   bound to a tenant. Querying them in platform context (no tenantId) is a bug
 *   and throws.
 * - NULLABLE_SCOPED: models whose `tenantId` is nullable (rows can be
 *   platform-owned). In tenant context they are filtered to the tenant; in
 *   platform context the extension does not filter (platform may see all rows).
 *
 * Model names are the Prisma model names as passed to `$allOperations` (the
 * PascalCase model name, e.g. "TenantUser").
 */
export const STRICT_SCOPED: ReadonlySet<string> = new Set([
  "TenantUser",
  "Client",
  "UserGroup",
  "TenantUserGroupMembership",
  "ClientGroup",
  "ClientGroupMembership",
  "PendingClientRegistration",
  "Template",
  // LMS domain — every row carries a non-nullable tenantId.
  "Course",
  "Lesson",
  "LessonGroup",
  "Programme",
  "ProgrammeCourse",
  "Enrollment",
  "LessonProgress",
  "CoursePayment",
  "ProgrammePayment",
  "Fee",
  "FeePayment",
  "Assignment",
  "Submission",
  "Grade",
  "QuestionBank",
  "QuestionBankAccess",
  "QuestionTag",
  "Question",
  "QuestionTagLink",
  "Quiz",
  "QuizQuestion",
  "QuizAttempt",
  "Certificate",
  "CertificateAward",
  "Event",
  "Message",
  "MessageRecipient",
  "Notification",
  "NotificationPreference",
  "LibraryItem",
  "LibraryFolder",
  "LibraryTag",
  "LibraryItemTag",
  "LibraryUpload",
  "LibraryUploadPart",
  "LibraryGrant",
  "LibraryEntitlement",
  "LibraryPayment",
  "LibraryProgress",
  "ProgrammeEnrollment",
  "SitePage",
  "SiteLayout",
  "ReferralCode",
  "ReferralEvent",
  // CBT / exams.
  "QuestionGroup",
  "Exam",
  "ExamSection",
  "ExamSectionItem",
  "ExamSitting",
  "ExamCandidate",
  "ExamAttempt",
  "ExamResponse",
  "ExamEvent",
  "ExamAnnouncement",
  // Looked up by token hash through rawPrisma before any context exists;
  // every other access is tenant-bound.
  "ExamSession",
  // Developer API & webhooks. ApiKey and LoginLinkToken are looked up by hash
  // through rawPrisma before any context exists; every other access is
  // tenant-bound. The webhook sweeper job reads due deliveries through
  // rawPrisma, then works each one inside its tenant's context.
  "ApiKey",
  "ApiUsage",
  "ApiIdempotency",
  "ApiRequestLog",
  "WebhookEndpoint",
  "WebhookEvent",
  "WebhookDelivery",
  "LoginLinkToken",
  // Integrations hub. CalendarFeedToken is looked up by hash through rawPrisma
  // (the public .ics URL carries no session); SSO callbacks bind the tenant
  // from the host before touching SsoIdentity. Everything else is tenant-bound.
  "TenantIntegration",
  "SsoIdentity",
  "IntegrationMeeting",
  "CalendarFeedToken",
]);

export const NULLABLE_SCOPED: ReadonlySet<string> = new Set([
  "RoleTemplate",
  "ActivityLog",
]);

export function isScopedModel(model: string | undefined): boolean {
  if (!model) return false;
  return STRICT_SCOPED.has(model) || NULLABLE_SCOPED.has(model);
}

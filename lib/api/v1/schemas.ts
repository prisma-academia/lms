import { z } from "zod";

/**
 * Every /api/v1 input is validated with these, and /api/v1/openapi.json is
 * generated from these — one source, so the docs cannot drift from the code.
 * Output schemas are documentation (handlers build their output with the
 * serializers in ./serialize.ts, which are typed against these).
 */

const iso = z.string().describe("ISO 8601 date-time");
const isoNullable = iso.nullable();
const id = z.string().min(1).max(64);

/* ───────────────────────────── list queries ───────────────────────────── */

export const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25).describe("Page size, 1–100 (default 25)."),
  cursor: z.string().min(1).max(64).optional().describe("The `meta.nextCursor` of the previous page."),
  updated_since: z.iso.datetime({ offset: true }).optional().describe("Only records changed (or, where a record has no update time, created) at or after this instant."),
  order: z.enum(["asc", "desc"]).default("desc").describe("Sort by the change/creation time."),
});
export type ListQueryInput = z.infer<typeof ListQuery>;

export const LearnerListQuery = ListQuery.extend({
  email: z.email().optional().describe("Exact email match."),
  external_id: z.string().min(1).max(200).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  group_id: id.optional().describe("Only members of this group."),
});

export const GroupListQuery = ListQuery.extend({ external_id: z.string().min(1).max(200).optional() });

export const CourseListQuery = ListQuery.extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  external_id: z.string().min(1).max(200).optional(),
});

export const ProgrammeListQuery = ListQuery.extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional() });

export const EnrollmentListQuery = ListQuery.extend({
  learner_id: id.optional(),
  course_id: id.optional(),
  completed: z.enum(["true", "false"]).optional(),
});

export const ExamListQuery = ListQuery.extend({ status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]).optional() });

export const AttemptListQuery = ListQuery.extend({
  status: z.enum(["IN_PROGRESS", "PAUSED", "LOCKED", "SUBMITTED", "TERMINATED"]).optional(),
  released: z.enum(["true", "false"]).optional(),
});

export const QuizAttemptListQuery = ListQuery.extend({ quiz_id: id.optional(), learner_id: id.optional() });

export const AwardListQuery = ListQuery.extend({ learner_id: id.optional(), certificate_id: id.optional() });

export const PaymentListQuery = ListQuery.extend({
  type: z.enum(["course", "programme"]).default("course"),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  learner_id: id.optional(),
});

export const FeeListQuery = ListQuery.extend({ learner_id: id.optional(), group_id: id.optional() });

export const EventListQuery = ListQuery.extend({
  from: z.iso.datetime({ offset: true }).optional().describe("Events starting at or after."),
  to: z.iso.datetime({ offset: true }).optional().describe("Events starting before."),
  type: z.enum(["LIVE_SESSION", "DEADLINE", "REMINDER", "ANNOUNCEMENT"]).optional(),
});

/* ───────────────────────────── inputs ───────────────────────────── */

const name = z.string().trim().min(1).max(100);
const externalId = z.string().trim().min(1).max(200);

export const LearnerCreate = z.object({
  email: z.email(),
  firstName: name.optional(),
  lastName: name.optional(),
  otherName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  externalId: externalId.optional(),
});

export const LearnerPatch = z
  .object({
    email: z.email(),
    firstName: name.nullable(),
    lastName: name.nullable(),
    otherName: z.string().trim().max(100).nullable(),
    phone: z.string().trim().max(40).nullable(),
    externalId: externalId.nullable(),
  })
  .partial();

/** PUT /learners/by-external-id/{externalId}: the external id comes from the path. */
export const LearnerUpsert = LearnerCreate.omit({ externalId: true });

export const LearnerBulk = z.object({
  learners: z.array(LearnerCreate).min(1).max(500),
  /** When true, a learner whose email or externalId exists is updated instead of reported. */
  upsert: z.boolean().default(false),
});

export const LoginLinkCreate = z.object({
  redirectPath: z.string().max(500).optional().describe("Where to land after sign-in, a path on the academy site (default /dashboard)."),
  expiresInMinutes: z.number().int().min(1).max(60).default(5),
});

export const GroupCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  externalId: externalId.optional(),
});
export const GroupPatch = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).nullable(),
    externalId: externalId.nullable(),
  })
  .partial();

export const GroupMembersAdd = z.object({ learnerIds: z.array(id).min(1).max(1000) });

export const EnrollmentCreate = z.object({ learnerId: id, courseId: id });

export const CandidateInput = z.object({
  learnerId: id.optional().describe("A learner with an account. Omit for an external candidate."),
  fullName: z.string().trim().min(1).max(200).optional().describe("Required for external candidates; defaults to the learner's name."),
  email: z.email().optional(),
  regNumber: z.string().trim().max(60).optional(),
  sittingId: id.optional(),
  extraTimePct: z.number().int().min(0).max(300).optional(),
});
export const CandidatesCreate = z.object({
  candidates: z.array(CandidateInput).min(1).max(500),
  resetExistingPins: z.boolean().default(false).describe("Issue new PINs to learners already on the list."),
});
export const CandidatesImport = z.object({
  candidates: z.array(CandidateInput).max(5000).optional(),
  csv: z.string().max(2_000_000).optional().describe("CSV with a header row: fullName,email,regNumber,learnerId,sittingId,extraTimePct"),
  resetExistingPins: z.boolean().default(false),
});

export const ReleaseResults = z.object({ attemptIds: z.array(id).max(5000).optional() });

const EventBase = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  type: z.enum(["LIVE_SESSION", "DEADLINE", "REMINDER", "ANNOUNCEMENT"]),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }).nullable().optional(),
  location: z.string().max(300).nullable().optional(),
  url: z.url().max(500).nullable().optional(),
  audience: z.enum(["ALL", "CLIENT", "GROUP"]).default("ALL").describe("CLIENT = one learner (learnerId); GROUP = one group (groupId)."),
  learnerId: id.nullable().optional(),
  groupId: id.nullable().optional(),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).optional(),
  recurrenceUntil: z.iso.datetime({ offset: true }).nullable().optional(),
};
export const EventCreate = z.object(EventBase);
export const EventPatch = z.object(EventBase).partial();

export const WebhookSubscribe = z.object({
  url: z.url().max(2000).describe("https:// only; must resolve to a public address."),
  events: z.array(z.string().min(1).max(60)).min(1).max(50).describe('Event types, or ["*"] for all.'),
  description: z.string().max(200).optional(),
});

/* ───────────────────────────── outputs ───────────────────────────── */

export const Learner = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  otherName: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  externalId: z.string().nullable(),
  createdAt: iso,
  lastLoginAt: isoNullable,
});

export const Group = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  externalId: z.string().nullable(),
  memberCount: z.number().int().optional(),
  createdAt: iso,
  updatedAt: iso,
});

export const Course = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  visibility: z.string(),
  priceCents: z.number().int().nullable(),
  currency: z.string(),
  externalId: z.string().nullable(),
  publishedAt: isoNullable,
  createdAt: iso,
  updatedAt: iso,
});

export const CourseOutline = Course.extend({
  outline: z.object({
    sections: z.array(z.object({ id: z.string(), title: z.string(), parentId: z.string().nullable(), sortOrder: z.number().int() })),
    lessons: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        sortOrder: z.number().int(),
        contentType: z.string(),
        durationMin: z.number().int().nullable(),
        sectionId: z.string().nullable(),
      })
    ),
  }),
});

export const Programme = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  visibility: z.string(),
  priceCents: z.number().int().nullable(),
  currency: z.string(),
  publishedAt: isoNullable,
  createdAt: iso,
  updatedAt: iso,
  courses: z.array(z.object({ courseId: z.string(), required: z.boolean(), sortOrder: z.number().int(), groupLabel: z.string().nullable() })).optional(),
});

export const Enrollment = z.object({
  id: z.string(),
  learnerId: z.string(),
  courseId: z.string(),
  enrolledAt: iso,
  completedAt: isoNullable,
  progressPercent: z.number().int(),
});

export const EnrollmentProgress = z.object({
  enrollmentId: z.string(),
  progressPercent: z.number().int(),
  completedAt: isoNullable,
  totalLessons: z.number().int(),
  lessons: z.array(z.object({ lessonId: z.string(), title: z.string(), startedAt: isoNullable, completedAt: isoNullable })),
});

export const Exam = z.object({
  id: z.string(),
  title: z.string(),
  code: z.string().nullable(),
  description: z.string().nullable(),
  status: z.string(),
  kind: z.string(),
  courseId: z.string().nullable(),
  durationMin: z.number().int(),
  opensAt: isoNullable,
  closesAt: isoNullable,
  passMark: z.number().int(),
  attemptsAllowed: z.number().int(),
  resultRelease: z.string(),
  accessMode: z.string(),
  pinLogin: z.boolean(),
  publishedAt: isoNullable,
  createdAt: iso,
  updatedAt: iso,
});

export const Sitting = z.object({
  id: z.string(),
  examId: z.string(),
  name: z.string(),
  startsAt: isoNullable,
  endsAt: isoNullable,
  venue: z.string().nullable(),
  capacity: z.number().int().nullable(),
  pausedAt: isoNullable,
  createdAt: iso,
});

export const Candidate = z.object({
  id: z.string(),
  examId: z.string(),
  learnerId: z.string().nullable(),
  fullName: z.string(),
  email: z.string().nullable(),
  regNumber: z.string().nullable(),
  candidateNo: z.string().describe("The Exam ID printed on the slip."),
  sittingId: z.string().nullable(),
  extraTimePct: z.number().int(),
  status: z.string(),
  createdAt: iso,
});

export const IssuedCandidate = z.object({
  id: z.string(),
  candidateNo: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  regNumber: z.string().nullable(),
  pin: z.string().describe('The 6-digit PIN, returned ONCE. "" for an existing candidate whose PIN was not reset.'),
  created: z.boolean(),
});

export const ExamAttempt = z.object({
  id: z.string(),
  examId: z.string(),
  candidateId: z.string(),
  learnerId: z.string().nullable(),
  candidateNo: z.string(),
  fullName: z.string(),
  attemptNo: z.number().int(),
  status: z.string(),
  startedAt: iso,
  submittedAt: isoNullable,
  submitReason: z.string().nullable(),
  scorePoints: z.number().nullable(),
  maxPoints: z.number().nullable(),
  scorePercent: z.number().nullable(),
  passed: z.boolean().nullable(),
  grade: z.string().nullable(),
  gradingStatus: z.string().nullable(),
  releasedAt: isoNullable,
  violationCount: z.number().int(),
});

export const QuizAttempt = z.object({
  id: z.string(),
  quizId: z.string(),
  learnerId: z.string(),
  startedAt: iso,
  submittedAt: isoNullable,
  scorePercent: z.number().int().nullable(),
  passed: z.boolean().nullable(),
  gradingStatus: z.string(),
});

export const CertificateAward = z.object({
  id: z.string(),
  certificateId: z.string(),
  certificateName: z.string(),
  learnerId: z.string(),
  courseId: z.string().nullable(),
  programmeId: z.string().nullable(),
  serial: z.string(),
  issuedAt: iso,
});

export const CertificateVerification = z.object({
  valid: z.boolean(),
  serial: z.string(),
  issuedAt: isoNullable,
  certificateName: z.string().nullable(),
  learnerName: z.string().nullable(),
  courseId: z.string().nullable(),
  programmeId: z.string().nullable(),
});

export const Payment = z.object({
  id: z.string(),
  type: z.enum(["course", "programme"]),
  itemId: z.string(),
  learnerId: z.string(),
  provider: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  status: z.string(),
  reference: z.string(),
  createdAt: iso,
  completedAt: isoNullable,
});

export const Fee = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  amountCents: z.number().int(),
  currency: z.string(),
  dueAt: isoNullable,
  learnerId: z.string().nullable(),
  groupId: z.string().nullable(),
  createdAt: iso,
  updatedAt: iso,
});

export const FeePayment = z.object({
  id: z.string(),
  feeId: z.string(),
  learnerId: z.string(),
  amountCents: z.number().int(),
  currency: z.string(),
  status: z.string(),
  method: z.string().nullable(),
  paidAt: isoNullable,
  note: z.string().nullable(),
  createdAt: iso,
  updatedAt: iso,
});

export const CalendarEvent = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  type: z.string(),
  startAt: iso,
  endAt: isoNullable,
  location: z.string().nullable(),
  url: z.string().nullable(),
  audience: z.string(),
  learnerId: z.string().nullable(),
  groupId: z.string().nullable(),
  recurrence: z.string(),
  recurrenceUntil: isoNullable,
  createdAt: iso,
  updatedAt: iso,
});

export const WebhookSubscription = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  description: z.string().nullable(),
  status: z.string(),
  createdAt: iso,
});

export const WebhookSubscriptionCreated = WebhookSubscription.extend({
  secret: z.string().describe("Signing secret (whsec_…), returned ONCE. Verify X-Prisma-Signature with it."),
});

export const Me = z.object({
  key: z.object({ id: z.string(), name: z.string(), prefix: z.string(), scopes: z.array(z.string()), rateLimitPerMin: z.number().int() }),
  tenant: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
});

export const LoginLink = z.object({ url: z.string(), expiresAt: iso });

export const BulkResult = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  results: z.array(
    z.object({
      index: z.number().int(),
      status: z.enum(["created", "updated", "skipped", "error"]),
      id: z.string().nullable(),
      error: z.string().nullable(),
    })
  ),
});

export type LearnerOut = z.infer<typeof Learner>;

# Feature scope: tenant vs platform

This document records which LMS features are intentionally **tenant-scoped**
(managed by each tenant's admins, isolated per tenant) vs **platform-scoped**
(managed by super-admins across all tenants). It exists so the boundary is a
deliberate product decision, not an accident of what happened to get built.

## Users & Groups

- **Tenant:** user groups (staff cohorts) and client groups (learner cohorts)
  are tenant-scoped. Models: `UserGroup`, `ClientGroup`, and their membership
  join tables. Managed at `/admin/user-groups` and `/admin/client-groups`.
  Memberships are many-to-many — a user or client may belong to many groups.
- **Platform:** **no group management.** Platform staff (`PlatformUser`) remain a
  flat list with permissions assigned directly; there is no cohort/group concept
  at the platform layer, and none is planned. Platform access control is via
  `isSuperAdmin` + platform role templates only.

## Content hierarchy (lessons, courses, programmes)

- **Tenant:** all learning content is tenant-scoped. Lessons (typed TEXT /
  VIDEO_URL / FILE / QUIZ) belong to a course and can be organized into
  `LessonGroup`s (with subgroups via `parentId`). Courses can stand alone or be
  bundled into a `Programme` (`ProgrammeCourse` marks each course
  required/optional, ordered, with an optional group label). Managed at
  `/admin/courses` and `/admin/programmes`.
- **Platform:** **no content-hierarchy management.** The platform layer never
  authors or manages courses, programmes, lessons, or quizzes — that is entirely
  a tenant responsibility. Platform sees only aggregate/billing signals, not
  content.

## Access, pricing & learner onboarding

- **Tenant:** each course and programme has a `visibility` (PUBLIC / PRIVATE)
  and optional price. Learners self-enroll only in PUBLIC published offerings
  (`/api/client/courses/*`, `/api/client/programmes/*`); PRIVATE offerings are
  hidden from the catalog and require staff to onboard learners manually
  (`/admin/enrollments` for courses, the programme editor for programmes). Staff
  may manually enroll into private and paid offerings without learner checkout.
- **Platform:** **no learner onboarding.** The platform never enrolls, prices,
  or grants course/programme access to a tenant's learners — onboarding is
  entirely the tenant's responsibility.

## Fees & payments

- **Tenant:** the `Fee` / `FeePayment` module (charging a client or a client
  group and tracking who paid) is tenant-scoped, at `/admin/fees`. Course
  purchase reporting lives at `/admin/course-payments` over existing
  `CoursePayment` rows.
- **Platform:** owns the **subscription plan catalog** (`SubscriptionPlan` CRUD
  at `/plans`) that tenants subscribe to, plus tenant billing lifecycle. The
  platform does NOT manage a tenant's own fees or course pricing.

## Assessments (question banks & quizzes)

- **Tenant:** question banks, tagged questions, quizzes, and learner attempts are
  tenant-scoped (`/admin/question-banks`, `/admin/quizzes`). Bank access can be
  restricted to user groups. A quiz is linked to a lesson via `QUIZ`
  `LessonContentType`; learners take it in the course player and are auto-scored.
- **Platform:** **no assessment content** — quizzes and question banks are purely
  tenant-scoped. Assignments (`Assignment`/`Submission`/`Grade`) remain a separate
  free-form workflow, unchanged.

## Certificates

- **Tenant:** the `Certificate` (WYSIWYG template design) and `CertificateAward`
  models are tenant-scoped (`/admin/certificates`). A certificate can be linked to
  a course so it is auto-awarded on completion, or issued manually. Learners view
  and print/download earned certificates at `/certificates`. The certificate
  template is its own model — the generic `Template` model + read-only
  `/admin/templates` list are unchanged (Template CRUD is a separate Phase 10 item).
- **Platform:** **no certificate management** — entirely tenant-scoped.

## Calendar & events

- **Tenant:** the `Event` model (typed live-session / deadline / reminder /
  announcement, with `ALL` / client / client-group audience and simple
  recurrence) is tenant-scoped. Staff manage it on a month calendar at
  `/admin/events`; learners see their relevant events at `/calendar` (direct or
  via group membership).
- **Platform:** **no calendar/events** — entirely tenant-scoped.

## Message center & notifications

- **Tenant:** `Message` / `MessageRecipient` (inbox), `Notification` (bell), and
  `NotificationPreference` (per-client, per-category in-app/email) are
  tenant-scoped. Staff compose at `/admin/messages` to all clients, a client, or
  a group; delivery fans out to the inbox, the notification bell, and email
  (respecting each learner's preferences via `lib/email/send.ts`). Learners read
  at `/inbox` and `/notifications`.
- **Platform:** platform-to-tenant announcements are **optional future scope**
  (not built). Platform email/OTP config remains env-based with no notification
  UI, by design.

## Resources / file management

- **Tenant:** the `Resource` / `ResourceGroup` / `ResourceTag` library is
  tenant-scoped (`/admin/resources`) with upload, tag, group, and preview.
  Presign is wired for all `PresignKind` values (logo, course_thumbnail,
  lesson_asset, resource, submission) via `/api/tenant/uploads/presign` and
  `/api/client/uploads/presign`; every path enforces `lib/storage/quota.ts`.
  Lesson file assets are chosen from the resource library in the course editor;
  course thumbnails upload inline. Learners access resources through linked
  lesson files and their assignment file uploads.
- **Platform:** storage quota + usage stats live on tenant detail; the platform
  has **no file browser** — the library is tenant-scoped by design.

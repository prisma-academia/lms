/**
 * Every webhook event type, with what it means. Imported by the developer
 * portal (client side) as well as the server, so it holds data only.
 *
 * `live: false` types are part of the published catalogue but nothing emits
 * them yet; the portal shows them as "coming soon" rather than letting an
 * academy subscribe to silence.
 */
export type WebhookEventInfo = {
  type: string;
  group: string;
  description: string;
  live: boolean;
};

export const WEBHOOK_EVENTS: WebhookEventInfo[] = [
  { type: "learner.created", group: "Learners", description: "A learner account was created (by staff, the API, or self-registration).", live: true },
  { type: "learner.updated", group: "Learners", description: "A learner's details or status changed through the API.", live: true },
  { type: "enrollment.created", group: "Learning", description: "A learner was enrolled on a course for the first time.", live: true },
  { type: "enrollment.completed", group: "Learning", description: "A learner finished every lesson of a course they are enrolled on.", live: true },
  { type: "lesson.completed", group: "Learning", description: "A learner completed a lesson (first completion only).", live: true },
  { type: "course.completed", group: "Learning", description: "A learner completed a course. Sent alongside enrollment.completed.", live: true },
  { type: "quiz.attempt.graded", group: "Assessment", description: "A quiz attempt received its final grade.", live: false },
  { type: "exam.published", group: "Exams", description: "An exam was published.", live: true },
  { type: "exam.attempt.started", group: "Exams", description: "A candidate started an exam attempt.", live: true },
  { type: "exam.attempt.submitted", group: "Exams", description: "An exam attempt was submitted or terminated.", live: true },
  { type: "exam.integrity.flagged", group: "Exams", description: "An attempt crossed an integrity-violation threshold.", live: true },
  { type: "exam.result.released", group: "Exams", description: "An exam result was released to the candidate.", live: true },
  { type: "certificate.issued", group: "Certificates", description: "A certificate was issued to a learner.", live: true },
  { type: "payment.succeeded", group: "Payments", description: "A course or programme purchase was paid and fulfilled.", live: true },
  { type: "payment.failed", group: "Payments", description: "A payment attempt failed.", live: false },
  { type: "fee.paid", group: "Payments", description: "A fee payment was recorded.", live: false },
  { type: "event.created", group: "Calendar", description: "A calendar event or live class was created through the API.", live: true },
  { type: "referral.recorded", group: "Referrals", description: "A staff referral was credited.", live: false },
];

export const WEBHOOK_EVENT_TYPES = WEBHOOK_EVENTS.map((e) => e.type);

/** The type "Send test event" uses. Delivered to the chosen endpoint only. */
export const TEST_EVENT_TYPE = "ping";

export function isKnownEventType(type: string): boolean {
  return type === "*" || WEBHOOK_EVENT_TYPES.includes(type);
}

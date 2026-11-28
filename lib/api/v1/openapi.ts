import { z } from "zod";
import * as S from "./schemas";
import { API_SCOPES, type ApiScope } from "./scopes";
import { WEBHOOK_EVENTS } from "@/lib/integrations/webhook-catalogue";

/**
 * The /api/v1 OpenAPI 3.1 document, generated from the zod schemas the
 * handlers validate with (zod 4's `z.toJSONSchema`, no extra package). Adding
 * an endpoint means adding a line to OPERATIONS; the in-app reference, the
 * code samples and the "Try it" console all read from the result.
 */

type Method = "get" | "post" | "put" | "patch" | "delete";

export type Operation = {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  description?: string;
  scope: ApiScope | null;
  query?: z.ZodObject;
  body?: z.ZodType;
  /** The `data` schema; `list: true` wraps it in an array with pagination meta. */
  response: z.ZodType;
  list?: boolean;
  status?: number;
};

const OPERATIONS: Operation[] = [
  { method: "get", path: "/me", tag: "Key", summary: "This key, its scopes and academy", scope: null, response: S.Me },

  { method: "get", path: "/learners", tag: "Learners", summary: "List learners", scope: "learners:read", query: S.LearnerListQuery, response: S.Learner, list: true },
  { method: "post", path: "/learners", tag: "Learners", summary: "Create a learner", scope: "learners:write", body: S.LearnerCreate, response: S.Learner, status: 201, description: "No email is sent and no password is set. Sign the learner in with a login link, or they can use Forgot password." },
  { method: "get", path: "/learners/{id}", tag: "Learners", summary: "Get a learner", scope: "learners:read", response: S.Learner },
  { method: "patch", path: "/learners/{id}", tag: "Learners", summary: "Update a learner", scope: "learners:write", body: S.LearnerPatch, response: S.Learner },
  { method: "get", path: "/learners/by-external-id/{externalId}", tag: "Learners", summary: "Find a learner by your id", scope: "learners:read", response: S.Learner },
  { method: "put", path: "/learners/by-external-id/{externalId}", tag: "Learners", summary: "Create or update a learner by your id", scope: "learners:write", body: S.LearnerUpsert, response: S.Learner, description: "201 when created, 200 when updated. A learner who exists by email without an externalId is linked." },
  { method: "post", path: "/learners/bulk", tag: "Learners", summary: "Import up to 500 learners", scope: "learners:write", body: S.LearnerBulk, response: S.BulkResult },
  { method: "post", path: "/learners/{id}/suspend", tag: "Learners", summary: "Suspend a learner", scope: "learners:write", response: S.Learner, description: "Blocks sign-in and ends every session." },
  { method: "post", path: "/learners/{id}/reactivate", tag: "Learners", summary: "Reactivate a learner", scope: "learners:write", response: S.Learner },
  { method: "post", path: "/learners/{id}/login-link", tag: "Learners", summary: "Mint a one-time sign-in link", scope: "learners:write", body: S.LoginLinkCreate, response: S.LoginLink, status: 201, description: "Redirect the learner's browser to `url` within its lifetime. Single use." },

  { method: "get", path: "/groups", tag: "Groups", summary: "List groups", scope: "groups:read", query: S.GroupListQuery, response: S.Group, list: true },
  { method: "post", path: "/groups", tag: "Groups", summary: "Create a group", scope: "groups:write", body: S.GroupCreate, response: S.Group, status: 201 },
  { method: "get", path: "/groups/{id}", tag: "Groups", summary: "Get a group", scope: "groups:read", response: S.Group },
  { method: "patch", path: "/groups/{id}", tag: "Groups", summary: "Update a group", scope: "groups:write", body: S.GroupPatch, response: S.Group },
  { method: "delete", path: "/groups/{id}", tag: "Groups", summary: "Delete a group", scope: "groups:write", response: z.object({ id: z.string(), deleted: z.boolean() }) },
  { method: "get", path: "/groups/{id}/members", tag: "Groups", summary: "List a group's learners", scope: "groups:read", query: S.ListQuery, response: S.Learner, list: true },
  { method: "post", path: "/groups/{id}/members", tag: "Groups", summary: "Add learners to a group", scope: "groups:write", body: S.GroupMembersAdd, response: z.object({ added: z.number().int(), alreadyMembers: z.number().int() }) },
  { method: "delete", path: "/groups/{id}/members/{learnerId}", tag: "Groups", summary: "Remove a learner from a group", scope: "groups:write", response: z.object({ removed: z.boolean() }) },

  { method: "get", path: "/courses", tag: "Courses", summary: "List courses", scope: "courses:read", query: S.CourseListQuery, response: S.Course, list: true },
  { method: "get", path: "/courses/{id}", tag: "Courses", summary: "Get a course with its lesson outline", scope: "courses:read", response: S.CourseOutline },
  { method: "get", path: "/programmes", tag: "Courses", summary: "List programmes", scope: "courses:read", query: S.ProgrammeListQuery, response: S.Programme, list: true },
  { method: "get", path: "/programmes/{id}", tag: "Courses", summary: "Get a programme with its courses", scope: "courses:read", response: S.Programme },

  { method: "get", path: "/enrollments", tag: "Enrollments", summary: "List enrolments", scope: "enrollments:read", query: S.EnrollmentListQuery, response: S.Enrollment, list: true },
  { method: "post", path: "/enrollments", tag: "Enrollments", summary: "Enrol a learner on a course", scope: "enrollments:write", body: S.EnrollmentCreate, response: S.Enrollment, status: 201, description: "Idempotent: 200 with the existing enrolment if already enrolled." },
  { method: "get", path: "/enrollments/{id}", tag: "Enrollments", summary: "Get an enrolment", scope: "enrollments:read", response: S.Enrollment },
  { method: "delete", path: "/enrollments/{id}", tag: "Enrollments", summary: "Unenrol (deletes progress)", scope: "enrollments:write", response: z.object({ id: z.string(), deleted: z.boolean() }) },
  { method: "get", path: "/enrollments/{id}/progress", tag: "Enrollments", summary: "Per-lesson progress", scope: "enrollments:read", response: S.EnrollmentProgress },

  { method: "get", path: "/exams", tag: "Exams", summary: "List exams", scope: "exams:read", query: S.ExamListQuery, response: S.Exam, list: true },
  { method: "get", path: "/exams/{id}", tag: "Exams", summary: "Get an exam", scope: "exams:read", response: S.Exam },
  { method: "get", path: "/exams/{id}/sittings", tag: "Exams", summary: "List an exam's sittings", scope: "exams:read", query: S.ListQuery, response: S.Sitting, list: true },
  { method: "get", path: "/exams/{id}/candidates", tag: "Exams", summary: "List candidates", scope: "exams:read", query: S.ListQuery, response: S.Candidate, list: true },
  { method: "post", path: "/exams/{id}/candidates", tag: "Exams", summary: "Add up to 500 candidates (PINs returned once)", scope: "exams:write", body: S.CandidatesCreate, response: z.array(S.IssuedCandidate), status: 201, description: "Send an Idempotency-Key: a retry without one issues new PINs." },
  { method: "post", path: "/exams/{id}/candidates/import", tag: "Exams", summary: "Import up to 5000 candidates (JSON or CSV)", scope: "exams:write", body: S.CandidatesImport, response: z.array(S.IssuedCandidate), status: 201 },
  { method: "get", path: "/exams/{id}/attempts", tag: "Exams", summary: "List attempts and results", scope: "results:read", query: S.AttemptListQuery, response: S.ExamAttempt, list: true },
  { method: "post", path: "/exams/{id}/release-results", tag: "Exams", summary: "Release marked results", scope: "exams:write", body: S.ReleaseResults, response: z.object({ released: z.number().int() }) },

  { method: "get", path: "/quiz-attempts", tag: "Results", summary: "List quiz attempts", scope: "results:read", query: S.QuizAttemptListQuery, response: S.QuizAttempt, list: true },

  { method: "get", path: "/certificates/awards", tag: "Certificates", summary: "List issued certificates", scope: "certificates:read", query: S.AwardListQuery, response: S.CertificateAward, list: true },
  { method: "get", path: "/certificates/verify/{serial}", tag: "Certificates", summary: "Verify a certificate serial", scope: "certificates:read", response: S.CertificateVerification },

  { method: "get", path: "/payments", tag: "Payments", summary: "List course or programme payments", scope: "payments:read", query: S.PaymentListQuery, response: S.Payment, list: true },
  { method: "get", path: "/fees", tag: "Payments", summary: "List fees", scope: "payments:read", query: S.FeeListQuery, response: S.Fee, list: true },
  { method: "get", path: "/fees/{id}/payments", tag: "Payments", summary: "List payments against a fee", scope: "payments:read", query: S.ListQuery, response: S.FeePayment, list: true },

  { method: "get", path: "/events", tag: "Events", summary: "List calendar events", scope: "events:read", query: S.EventListQuery, response: S.CalendarEvent, list: true },
  { method: "post", path: "/events", tag: "Events", summary: "Create an event / live class", scope: "events:write", body: S.EventCreate, response: S.CalendarEvent, status: 201 },
  { method: "get", path: "/events/{id}", tag: "Events", summary: "Get an event", scope: "events:read", response: S.CalendarEvent },
  { method: "patch", path: "/events/{id}", tag: "Events", summary: "Update an event", scope: "events:write", body: S.EventPatch, response: S.CalendarEvent },
  { method: "delete", path: "/events/{id}", tag: "Events", summary: "Delete an event", scope: "events:write", response: z.object({ id: z.string(), deleted: z.boolean() }) },

  { method: "get", path: "/webhooks", tag: "Webhooks", summary: "List webhook subscriptions", scope: "webhooks:manage", query: S.ListQuery, response: S.WebhookSubscription, list: true },
  { method: "post", path: "/webhooks", tag: "Webhooks", summary: "Subscribe (REST hook)", scope: "webhooks:manage", body: S.WebhookSubscribe, response: S.WebhookSubscriptionCreated, status: 201, description: "For Zapier, Make and n8n. The secret is returned once." },
  { method: "delete", path: "/webhooks/{id}", tag: "Webhooks", summary: "Unsubscribe", scope: "webhooks:manage", response: z.object({ id: z.string(), deleted: z.boolean() }) },
];

/** Named schemas → components.schemas. */
const NAMED: Array<[string, z.ZodType]> = [
  ["Me", S.Me],
  ["Learner", S.Learner],
  ["BulkResult", S.BulkResult],
  ["LoginLink", S.LoginLink],
  ["Group", S.Group],
  ["Course", S.Course],
  ["CourseOutline", S.CourseOutline],
  ["Programme", S.Programme],
  ["Enrollment", S.Enrollment],
  ["EnrollmentProgress", S.EnrollmentProgress],
  ["Exam", S.Exam],
  ["Sitting", S.Sitting],
  ["Candidate", S.Candidate],
  ["IssuedCandidate", S.IssuedCandidate],
  ["ExamAttempt", S.ExamAttempt],
  ["QuizAttempt", S.QuizAttempt],
  ["CertificateAward", S.CertificateAward],
  ["CertificateVerification", S.CertificateVerification],
  ["Payment", S.Payment],
  ["Fee", S.Fee],
  ["FeePayment", S.FeePayment],
  ["CalendarEvent", S.CalendarEvent],
  ["WebhookSubscription", S.WebhookSubscription],
  ["WebhookSubscriptionCreated", S.WebhookSubscriptionCreated],
];

type Json = Record<string, unknown>;

function schemaOf(s: z.ZodType, io: "input" | "output"): Json {
  const out = z.toJSONSchema(s, { io, unrepresentable: "any" }) as Json;
  delete out.$schema;
  return out;
}

function refOrInline(s: z.ZodType): Json {
  const named = NAMED.find(([, schema]) => schema === s);
  if (named) return { $ref: `#/components/schemas/${named[0]}` };
  if (s instanceof z.ZodArray) {
    const inner = NAMED.find(([, schema]) => schema === s.element);
    if (inner) return { type: "array", items: { $ref: `#/components/schemas/${inner[0]}` } };
  }
  return schemaOf(s, "output");
}

function isOptional(s: z.ZodType): boolean {
  return s.safeParse(undefined).success;
}

export type OpenApiDoc = Json & {
  paths: Record<string, Record<string, Json>>;
};

export function buildOpenApi(serverUrl: string): OpenApiDoc {
  const paths: Record<string, Record<string, Json>> = {};
  for (const op of OPERATIONS) {
    const pathParams = [...op.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    const parameters: Json[] = pathParams.map((name) => ({ name, in: "path", required: true, schema: { type: "string" } }));
    if (op.query) {
      for (const [name, s] of Object.entries(op.query.shape)) {
        const js = schemaOf(s as z.ZodType, "input");
        parameters.push({ name, in: "query", required: !isOptional(s as z.ZodType), schema: js, ...(js.description ? { description: js.description } : {}) });
      }
    }
    const data = op.list ? { type: "array", items: refOrInline(op.response) } : refOrInline(op.response);
    const status = String(op.status ?? 200);
    const operation: Json = {
      operationId: `${op.method}${op.path.replace(/\{(\w+)\}/g, "By_$1").replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ""))}`,
      tags: [op.tag],
      summary: op.summary,
      ...(op.description ? { description: op.description } : {}),
      "x-scope": op.scope,
      security: [{ bearerAuth: [] }],
      ...(parameters.length ? { parameters } : {}),
      ...(op.body
        ? { requestBody: { required: true, content: { "application/json": { schema: schemaOf(op.body, "input") } } } }
        : {}),
      responses: {
        [status]: {
          description: "OK",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: data,
                  error: { type: "null" },
                  ...(op.list ? { meta: { $ref: "#/components/schemas/PageMeta" } } : {}),
                },
                required: ["data", "error"],
              },
            },
          },
        },
        "4XX": { $ref: "#/components/responses/Error" },
      },
    };
    (paths[op.path] ??= {})[op.method] = operation;
  }

  const schemas: Record<string, Json> = Object.fromEntries(NAMED.map(([name, s]) => [name, schemaOf(s, "output")]));
  schemas.PageMeta = {
    type: "object",
    properties: { nextCursor: { type: ["string", "null"] }, hasMore: { type: "boolean" }, limit: { type: "integer" } },
    required: ["nextCursor", "hasMore", "limit"],
  };
  schemas.Error = {
    type: "object",
    properties: {
      data: { type: "null" },
      error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } }, required: ["code", "message"] },
    },
    required: ["data", "error"],
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "Prisma LMS Developer API",
      version: "1.0.0",
      description:
        "Every request needs `Authorization: Bearer plms_live_…`. Responses use the `{ data, error, meta }` envelope. " +
        "Lists take `limit` (≤100), `cursor` (the previous `meta.nextCursor`), `updated_since` and `order`. " +
        "POST/PATCH/PUT accept an `Idempotency-Key` header (kept 24 h). Every response carries `X-Request-Id` and `X-RateLimit-*` headers.",
    },
    servers: [{ url: serverUrl }],
    tags: [...new Set(OPERATIONS.map((o) => o.tag))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "A Developer API key: plms_live_<prefix>_<secret>." } },
      schemas,
      responses: {
        Error: { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
    "x-scopes": API_SCOPES,
    "x-webhook-events": WEBHOOK_EVENTS,
  };
}

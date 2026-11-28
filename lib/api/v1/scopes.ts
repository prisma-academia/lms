/**
 * What a Developer API key may do. Scopes are coarse on purpose: an academy
 * picks a preset, and each scope maps to a whole resource family.
 */
export const API_SCOPES = {
  "learners:read": "Read learners",
  "learners:write": "Create, update, suspend learners and mint sign-in links",
  "groups:read": "Read learner groups and their members",
  "groups:write": "Create, update, delete groups and change members",
  "courses:read": "Read courses, programmes and lesson outlines",
  "enrollments:read": "Read enrolments and progress",
  "enrollments:write": "Enrol and unenrol learners",
  "exams:read": "Read exams, sittings and candidates",
  "exams:write": "Add candidates (PINs) and release results",
  "results:read": "Read exam attempts / results and quiz attempts",
  "certificates:read": "Read issued certificates",
  "payments:read": "Read course / programme payments and fees",
  "events:read": "Read calendar events and live classes",
  "events:write": "Create, update, delete calendar events",
  "webhooks:manage": "Subscribe and unsubscribe webhooks (REST hooks)",
} as const;

export type ApiScope = keyof typeof API_SCOPES;

export const ALL_API_SCOPES = Object.keys(API_SCOPES) as ApiScope[];

export function isApiScope(s: string): s is ApiScope {
  return Object.prototype.hasOwnProperty.call(API_SCOPES, s);
}

export const SCOPE_PRESETS: Record<"readonly" | "learner_sync" | "exams" | "full", { label: string; description: string; scopes: ApiScope[] }> = {
  readonly: {
    label: "Read-only",
    description: "Every :read scope. For reporting and dashboards.",
    scopes: ALL_API_SCOPES.filter((s) => s.endsWith(":read")),
  },
  learner_sync: {
    label: "Learner sync",
    description: "Keep learners, groups and enrolments in step with a school portal, HR or CRM.",
    scopes: ["learners:read", "learners:write", "groups:read", "groups:write", "courses:read", "enrollments:read", "enrollments:write"],
  },
  exams: {
    label: "Exams",
    description: "Register candidates, issue PINs, pull and release results.",
    scopes: ["exams:read", "exams:write", "results:read", "learners:read", "groups:read"],
  },
  full: {
    label: "Full access",
    description: "Everything, including webhook subscriptions.",
    scopes: [...ALL_API_SCOPES],
  },
};

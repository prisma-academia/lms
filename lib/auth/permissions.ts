export const PERMISSIONS = {
  // Platform-scope
  PLATFORM_TENANTS_READ: { key: "platform.tenants:read", module: "platform.tenants", description: "View tenants" },
  PLATFORM_TENANTS_WRITE: { key: "platform.tenants:write", module: "platform.tenants", description: "Create / modify tenants" },
  PLATFORM_USERS_READ: { key: "platform.users:read", module: "platform.users", description: "View platform users" },
  PLATFORM_USERS_WRITE: { key: "platform.users:write", module: "platform.users", description: "Invite / modify platform users" },
  PLATFORM_ROLES_READ: { key: "platform.roles:read", module: "platform.roles", description: "View platform role templates" },
  PLATFORM_ROLES_WRITE: { key: "platform.roles:write", module: "platform.roles", description: "Modify platform role templates" },
  PLATFORM_ACTIVITY_READ: { key: "platform.activity:read", module: "platform.activity", description: "View platform-wide activity log" },
  PLATFORM_SETTINGS_WRITE: { key: "platform.settings:write", module: "platform.settings", description: "Modify platform settings" },
  PLATFORM_PLANS_READ: { key: "platform.plans:read", module: "platform.plans", description: "View subscription plans" },
  PLATFORM_PLANS_WRITE: { key: "platform.plans:write", module: "platform.plans", description: "Create / modify subscription plans" },
  // Tenant-scope
  TENANT_USERS_READ: { key: "tenant.users:read", module: "tenant.users", description: "View tenant users" },
  TENANT_USERS_WRITE: { key: "tenant.users:write", module: "tenant.users", description: "Invite / modify tenant users" },
  TENANT_CLIENTS_READ: { key: "tenant.clients:read", module: "tenant.clients", description: "View clients" },
  TENANT_CLIENTS_WRITE: { key: "tenant.clients:write", module: "tenant.clients", description: "Create / modify clients" },
  TENANT_GROUPS_READ: { key: "tenant.groups:read", module: "tenant.groups", description: "View user and client groups" },
  TENANT_GROUPS_WRITE: { key: "tenant.groups:write", module: "tenant.groups", description: "Create / modify groups and memberships" },
  TENANT_ROLES_READ: { key: "tenant.roles:read", module: "tenant.roles", description: "View tenant role templates" },
  TENANT_ROLES_WRITE: { key: "tenant.roles:write", module: "tenant.roles", description: "Modify tenant role templates" },
  TENANT_ACTIVITY_READ: { key: "tenant.activity:read", module: "tenant.activity", description: "View tenant activity log" },
  TENANT_TEMPLATES_READ: { key: "tenant.templates:read", module: "tenant.templates", description: "View templates" },
  TENANT_TEMPLATES_WRITE: { key: "tenant.templates:write", module: "tenant.templates", description: "Modify templates" },
  TENANT_SETTINGS_READ: { key: "tenant.settings:read", module: "tenant.settings", description: "View tenant settings" },
  TENANT_SETTINGS_WRITE: { key: "tenant.settings:write", module: "tenant.settings", description: "Modify tenant settings" },
  TENANT_COURSES_READ: { key: "tenant.courses:read", module: "tenant.courses", description: "View courses" },
  TENANT_COURSES_WRITE: { key: "tenant.courses:write", module: "tenant.courses", description: "Create / modify courses" },
  TENANT_PROGRAMMES_READ: { key: "tenant.programmes:read", module: "tenant.programmes", description: "View programmes" },
  TENANT_PROGRAMMES_WRITE: { key: "tenant.programmes:write", module: "tenant.programmes", description: "Create / modify programmes" },
  TENANT_ENROLLMENTS_READ: { key: "tenant.enrollments:read", module: "tenant.enrollments", description: "View enrollments" },
  TENANT_ENROLLMENTS_WRITE: { key: "tenant.enrollments:write", module: "tenant.enrollments", description: "Manage enrollments" },
  TENANT_ASSIGNMENTS_READ: { key: "tenant.assignments:read", module: "tenant.assignments", description: "View assignments and submissions" },
  TENANT_ASSIGNMENTS_WRITE: { key: "tenant.assignments:write", module: "tenant.assignments", description: "Create / modify assignments" },
  TENANT_QUIZZES_READ: { key: "tenant.quizzes:read", module: "tenant.quizzes", description: "View quizzes and question banks" },
  TENANT_QUIZZES_WRITE: { key: "tenant.quizzes:write", module: "tenant.quizzes", description: "Create / modify quizzes and questions" },
  TENANT_CERTIFICATES_READ: { key: "tenant.certificates:read", module: "tenant.certificates", description: "View certificates and awards" },
  TENANT_CERTIFICATES_WRITE: { key: "tenant.certificates:write", module: "tenant.certificates", description: "Design certificates and issue awards" },
  TENANT_EVENTS_READ: { key: "tenant.events:read", module: "tenant.events", description: "View calendar events" },
  TENANT_EVENTS_WRITE: { key: "tenant.events:write", module: "tenant.events", description: "Create / modify calendar events" },
  TENANT_MESSAGES_READ: { key: "tenant.messages:read", module: "tenant.messages", description: "View sent messages" },
  TENANT_MESSAGES_WRITE: { key: "tenant.messages:write", module: "tenant.messages", description: "Compose and send messages" },
  TENANT_LIBRARY_READ: { key: "tenant.library:read", module: "tenant.library", description: "View the media library" },
  TENANT_LIBRARY_WRITE: { key: "tenant.library:write", module: "tenant.library", description: "Upload and manage library media" },
  TENANT_LIBRARY_ASSIGN: { key: "tenant.library:assign", module: "tenant.library", description: "Assign library media to learners, groups, courses and programmes" },
  TENANT_GRADES_READ: { key: "tenant.grades:read", module: "tenant.grades", description: "View grades" },
  TENANT_GRADES_WRITE: { key: "tenant.grades:write", module: "tenant.grades", description: "Grade submissions" },
  TENANT_BILLING_READ: { key: "tenant.billing:read", module: "tenant.billing", description: "View billing and payouts" },
  TENANT_BILLING_WRITE: { key: "tenant.billing:write", module: "tenant.billing", description: "Manage billing and settlement details" },
  TENANT_FEES_READ: { key: "tenant.fees:read", module: "tenant.fees", description: "View fees and payment tracking" },
  TENANT_FEES_WRITE: { key: "tenant.fees:write", module: "tenant.fees", description: "Create fees and record payments" },
  CLIENT_COURSES_READ: { key: "client.courses:read", module: "client.courses", description: "View course catalog" },
  CLIENT_PROGRESS_WRITE: { key: "client.progress:write", module: "client.progress", description: "Track lesson progress" },
  CLIENT_ASSIGNMENTS_READ: { key: "client.assignments:read", module: "client.assignments", description: "View assignments and grades" },
  CLIENT_SUBMISSIONS_WRITE: { key: "client.submissions:write", module: "client.submissions", description: "Submit assignment work" },
  CLIENT_LIBRARY_READ: { key: "client.library:read", module: "client.library", description: "View the media library" },
  CLIENT_LIBRARY_WRITE: { key: "client.library:write", module: "client.library", description: "Track library playback progress" },
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]["key"];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const ALL_PLATFORM_PERMISSION_KEYS: PermissionKey[] = ALL_PERMISSIONS
  .filter((p) => p.key.startsWith("platform."))
  .map((p) => p.key as PermissionKey);

export const ALL_TENANT_PERMISSION_KEYS: PermissionKey[] = ALL_PERMISSIONS
  .filter((p) => p.key.startsWith("tenant."))
  .map((p) => p.key as PermissionKey);

// Built-in tenant role templates seeded per-tenant on tenant creation.
export const TENANT_BUILTIN_ROLES = [
  { name: "Owner", permissions: ALL_TENANT_PERMISSION_KEYS, isSystem: true },
  {
    name: "Admin",
    permissions: ALL_TENANT_PERMISSION_KEYS.filter((k) => !k.endsWith("settings:write")) as PermissionKey[],
    isSystem: true,
  },
  {
    name: "Instructor",
    permissions: [
      PERMISSIONS.TENANT_COURSES_READ.key,
      PERMISSIONS.TENANT_COURSES_WRITE.key,
      PERMISSIONS.TENANT_PROGRAMMES_READ.key,
      PERMISSIONS.TENANT_PROGRAMMES_WRITE.key,
      PERMISSIONS.TENANT_ENROLLMENTS_READ.key,
      PERMISSIONS.TENANT_ENROLLMENTS_WRITE.key,
      PERMISSIONS.TENANT_ASSIGNMENTS_READ.key,
      PERMISSIONS.TENANT_ASSIGNMENTS_WRITE.key,
      PERMISSIONS.TENANT_QUIZZES_READ.key,
      PERMISSIONS.TENANT_QUIZZES_WRITE.key,
      PERMISSIONS.TENANT_GRADES_READ.key,
      PERMISSIONS.TENANT_GRADES_WRITE.key,
      PERMISSIONS.TENANT_CLIENTS_READ.key,
      PERMISSIONS.TENANT_ACTIVITY_READ.key,
      // Instructors hand media to their own cohorts, so they get assign too.
      PERMISSIONS.TENANT_LIBRARY_READ.key,
      PERMISSIONS.TENANT_LIBRARY_WRITE.key,
      PERMISSIONS.TENANT_LIBRARY_ASSIGN.key,
    ] as PermissionKey[],
    isSystem: true,
  },
  {
    name: "Staff",
    permissions: [
      PERMISSIONS.TENANT_USERS_READ.key,
      PERMISSIONS.TENANT_CLIENTS_READ.key,
      PERMISSIONS.TENANT_CLIENTS_WRITE.key,
      PERMISSIONS.TENANT_GROUPS_READ.key,
      PERMISSIONS.TENANT_COURSES_READ.key,
      PERMISSIONS.TENANT_ENROLLMENTS_READ.key,
      PERMISSIONS.TENANT_TEMPLATES_READ.key,
      PERMISSIONS.TENANT_LIBRARY_READ.key,
    ] as PermissionKey[],
    isSystem: true,
  },
  {
    name: "Read-only",
    permissions: ALL_TENANT_PERMISSION_KEYS.filter((k) => k.endsWith(":read")) as PermissionKey[],
    isSystem: true,
  },
] as const;

export type PlatformActor = {
  kind: "platform";
  userId: string;
  isSuperAdmin: boolean;
  permissions: ReadonlySet<string>;
};

export type TenantActor = {
  kind: "tenant";
  userId: string;
  tenantId: string;
  isOwner: boolean;
  permissions: ReadonlySet<string>;
};

export type ClientActor = {
  kind: "client";
  clientId: string;
  tenantId: string;
};

export type AnyActor = PlatformActor | TenantActor | ClientActor;

export function hasPermission(actor: PlatformActor | TenantActor, key: PermissionKey): boolean {
  if (actor.kind === "platform" && actor.isSuperAdmin) return true;
  if (actor.kind === "tenant" && actor.isOwner) return true;
  return actor.permissions.has(key);
}

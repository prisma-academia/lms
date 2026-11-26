/**
 * The catalog of variables a site page may reference.
 *
 * One list, two consumers: the CodeMirror completion source in the admin editor
 * and `buildVariableContext` on the server. Keeping them on the same array is
 * the point — a variable that autocompletes but resolves to nothing, or resolves
 * but is undiscoverable, is worse than one that does not exist.
 *
 * Client-safe by construction: no Prisma, no server imports. The resolution
 * lives next door in `variable-context.ts`, which is server-only.
 */

export type VariableKind = "scalar" | "list";

export type VariableDef = {
  /**
   * Page kinds this variable exists on. Absent = every page. A course page's
   * `course.*` has nothing to resolve to on the home page, so the editor only
   * offers it where it works.
   */
  only?: ("COURSES" | "COURSE_DETAIL" | "PROGRAMME_DETAIL")[];
  /** Dotted path as written in a template, e.g. `tenant.name`. */
  path: string;
  kind: VariableKind;
  label: string;
  /**
   * Only resolves for a signed-in learner. Anonymous visitors — which is most
   * traffic on a public marketing page — get an empty value, so the editor
   * flags these rather than letting someone ship a page that looks blank.
   */
  authOnly?: boolean;
  /** Shown in autocomplete and used by the live preview before data loads. */
  sample: string;
  /** For `kind: "list"`, the fields available on `this` inside `{{#each}}`. */
  fields?: { name: string; label: string; sample: string }[];
};

/** Prefixes whose presence forces the page to resolve the viewer's session. */
export const AUTH_VARIABLE_PREFIXES = ["user.", "progress."] as const;

const COURSE_FIELDS = [
  { name: "title", label: "Course title", sample: "Introduction to Safety" },
  { name: "description", label: "Short description", sample: "A practical grounding in workplace safety." },
  { name: "url", label: "Link to the course page", sample: "/courses/introduction-to-safety" },
  { name: "price", label: "Formatted price", sample: "₦25,000" },
  { name: "thumbnailUrl", label: "Cover image URL", sample: "" },
  { name: "lessonCount", label: "Number of lessons", sample: "12" },
];

const PROGRAMME_FIELDS = [
  { name: "title", label: "Programme title", sample: "Health & Safety Diploma" },
  { name: "description", label: "Short description", sample: "A six-course pathway to certification." },
  { name: "url", label: "Link to the programme page", sample: "/programmes/health-safety-diploma" },
  { name: "price", label: "Formatted price", sample: "₦120,000" },
  { name: "thumbnailUrl", label: "Cover image URL", sample: "" },
  { name: "courseCount", label: "Number of courses", sample: "6" },
];

const NAV_FIELDS = [
  { name: "title", label: "Page title", sample: "About" },
  { name: "url", label: "Link to the page", sample: "/about" },
  { name: "current", label: "Whether it is the page being viewed", sample: "false" },
];

const OUTLINE_FIELDS = [
  { name: "title", label: "Lesson title", sample: "What is a budget?" },
  { name: "module", label: "Module it belongs to", sample: "Module 1" },
  { name: "kind", label: "Reading, video, quiz or file", sample: "Reading" },
  { name: "duration", label: "Length, when known", sample: "8 min" },
];

const PROGRAMME_COURSE_FIELDS = [
  { name: "title", label: "Course title", sample: "Introduction to Safety" },
  { name: "description", label: "Short description", sample: "A practical grounding in workplace safety." },
  { name: "url", label: "Link to the course page", sample: "/courses/introduction-to-safety" },
  { name: "lessonCount", label: "Number of lessons", sample: "12" },
];

const ENROLLMENT_FIELDS = [
  { name: "courseTitle", label: "Course title", sample: "Introduction to Safety" },
  { name: "url", label: "Link to continue", sample: "/courses/introduction-to-safety" },
  { name: "percent", label: "Percent complete", sample: "60" },
  { name: "completed", label: "Whether it is finished", sample: "false" },
];

export const SITE_VARIABLES: VariableDef[] = [
  // Organisation and branding — always available, no session needed.
  { path: "tenant.name", kind: "scalar", label: "Organisation name", sample: "Acme Academy" },
  { path: "tenant.logoUrl", kind: "scalar", label: "Logo image URL", sample: "" },
  {
    path: "tenant.heroImageUrl",
    kind: "scalar",
    label: "Hero image URL (Settings → Branding)",
    sample: "",
  },
  { path: "tenant.email", kind: "scalar", label: "Contact email", sample: "hello@acme.test" },
  { path: "tenant.phone", kind: "scalar", label: "Contact phone", sample: "+234 800 000 0000" },
  { path: "tenant.website", kind: "scalar", label: "Website URL", sample: "https://acme.test" },
  { path: "tenant.location", kind: "scalar", label: "City, country", sample: "Lagos, Nigeria" },
  { path: "tenant.address", kind: "scalar", label: "Full postal address", sample: "12 Marina Road, Lagos" },
  { path: "tenant.city", kind: "scalar", label: "City", sample: "Lagos" },
  { path: "tenant.country", kind: "scalar", label: "Country", sample: "Nigeria" },
  { path: "tenant.primaryColor", kind: "scalar", label: "Brand colour (hex)", sample: "#0f172a" },

  // This page.
  { path: "site.title", kind: "scalar", label: "This page's title", sample: "Home" },
  { path: "site.slug", kind: "scalar", label: "This page's URL path", sample: "about" },
  { path: "site.year", kind: "scalar", label: "Current year", sample: "2026" },
  { path: "site.origin", kind: "scalar", label: "Site origin URL", sample: "https://acme.test" },

  // Accounts. Each link brings the visitor back to the page they were on.
  { path: "auth.loginUrl", kind: "scalar", label: "Link to sign in", sample: "/auth/login" },
  { path: "auth.registerUrl", kind: "scalar", label: "Link to create an account", sample: "/auth/register" },
  { path: "auth.forgotPasswordUrl", kind: "scalar", label: "Link to reset a password", sample: "/auth/forgot-password" },
  { path: "auth.dashboardUrl", kind: "scalar", label: "Link to the learner's dashboard", sample: "/dashboard" },

  // Menu.
  {
    path: "nav",
    kind: "list",
    label: "Published pages shown in the menu",
    sample: "3 pages",
    fields: NAV_FIELDS,
  },

  // Catalogue links and search.
  { path: "catalog.coursesUrl", kind: "scalar", label: "Link to the course catalogue", sample: "/courses" },
  { path: "catalog.programmesUrl", kind: "scalar", label: "Link to the programme list", sample: "/programmes" },
  {
    path: "catalog.query",
    kind: "scalar",
    label: "What the visitor searched for",
    sample: "",
    only: ["COURSES"],
  },
  {
    path: "catalog.count",
    kind: "scalar",
    label: "Number of courses shown",
    sample: "3",
    only: ["COURSES"],
  },

  // The course a course page is showing.
  { path: "course.title", kind: "scalar", label: "Course title", sample: "Introduction to Safety", only: ["COURSE_DETAIL"] },
  { path: "course.description", kind: "scalar", label: "Course description", sample: "A practical grounding in workplace safety.", only: ["COURSE_DETAIL"] },
  { path: "course.price", kind: "scalar", label: "Formatted price, or Free", sample: "₦25,000", only: ["COURSE_DETAIL"] },
  { path: "course.isFree", kind: "scalar", label: "Whether the course is free", sample: "false", only: ["COURSE_DETAIL"] },
  { path: "course.thumbnailUrl", kind: "scalar", label: "Cover image URL", sample: "", only: ["COURSE_DETAIL"] },
  { path: "course.lessonCount", kind: "scalar", label: "Number of lessons", sample: "12", only: ["COURSE_DETAIL"] },
  { path: "course.url", kind: "scalar", label: "This course's address", sample: "/courses/introduction-to-safety", only: ["COURSE_DETAIL"] },
  { path: "course.joinUrl", kind: "scalar", label: "Link to register and come back to this course", sample: "/auth/register", only: ["COURSE_DETAIL"] },
  { path: "course.signInUrl", kind: "scalar", label: "Link to sign in and come back to this course", sample: "/auth/login", only: ["COURSE_DETAIL"] },
  {
    path: "course.lessons",
    kind: "list",
    label: "The course outline (titles only)",
    sample: "12 lessons",
    fields: OUTLINE_FIELDS,
    only: ["COURSE_DETAIL"],
  },

  // The programme a programme page is showing.
  { path: "programme.title", kind: "scalar", label: "Programme title", sample: "Health & Safety Diploma", only: ["PROGRAMME_DETAIL"] },
  { path: "programme.description", kind: "scalar", label: "Programme description", sample: "A six-course pathway to certification.", only: ["PROGRAMME_DETAIL"] },
  { path: "programme.price", kind: "scalar", label: "Formatted price, or Free", sample: "₦120,000", only: ["PROGRAMME_DETAIL"] },
  { path: "programme.isFree", kind: "scalar", label: "Whether the programme is free", sample: "false", only: ["PROGRAMME_DETAIL"] },
  { path: "programme.thumbnailUrl", kind: "scalar", label: "Cover image URL", sample: "", only: ["PROGRAMME_DETAIL"] },
  { path: "programme.courseCount", kind: "scalar", label: "Number of courses", sample: "6", only: ["PROGRAMME_DETAIL"] },
  { path: "programme.joinUrl", kind: "scalar", label: "Link to register and come back to this programme", sample: "/auth/register", only: ["PROGRAMME_DETAIL"] },
  { path: "programme.signInUrl", kind: "scalar", label: "Link to sign in and come back to this programme", sample: "/auth/login", only: ["PROGRAMME_DETAIL"] },
  {
    path: "programme.courses",
    kind: "list",
    label: "The courses in the programme",
    sample: "6 courses",
    fields: PROGRAMME_COURSE_FIELDS,
    only: ["PROGRAMME_DETAIL"],
  },

  // Catalog.
  {
    path: "courses",
    kind: "list",
    label: "Published public courses",
    sample: "3 courses",
    fields: COURSE_FIELDS,
  },
  {
    path: "programmes",
    kind: "list",
    label: "Published public programmes",
    sample: "2 programmes",
    fields: PROGRAMME_FIELDS,
  },

  // Viewer — only meaningful for a signed-in learner.
  { path: "user.isAuthenticated", kind: "scalar", label: "Is a learner signed in?", authOnly: true, sample: "true" },
  { path: "user.name", kind: "scalar", label: "Learner's name", authOnly: true, sample: "Ada Lovelace" },
  { path: "user.email", kind: "scalar", label: "Learner's email", authOnly: true, sample: "ada@example.com" },
  { path: "progress.enrollmentCount", kind: "scalar", label: "Courses enrolled in", authOnly: true, sample: "4" },
  { path: "progress.completedCount", kind: "scalar", label: "Courses completed", authOnly: true, sample: "2" },
  { path: "progress.averagePercent", kind: "scalar", label: "Average completion (%)", authOnly: true, sample: "68" },
  {
    path: "progress.enrollments",
    kind: "list",
    label: "The learner's enrolled courses",
    authOnly: true,
    sample: "4 enrollments",
    fields: ENROLLMENT_FIELDS,
  },
];

export function findVariable(path: string): VariableDef | undefined {
  return SITE_VARIABLES.find((v) => v.path === path);
}

/** Group the catalog by its leading segment, for the editor's reference panel. */
export function variableGroups(): { group: string; items: VariableDef[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, VariableDef[]>();
  for (const v of SITE_VARIABLES) {
    const group = v.path.includes(".") ? v.path.split(".")[0] : v.path;
    if (!byGroup.has(group)) {
      byGroup.set(group, []);
      order.push(group);
    }
    byGroup.get(group)!.push(v);
  }
  return order.map((group) => ({ group, items: byGroup.get(group)! }));
}

/** The variables that exist on a page of this kind. */
export function variablesForKind(kind: string | null | undefined): VariableDef[] {
  return SITE_VARIABLES.filter((v) => !v.only || v.only.includes(kind as never));
}

export const GROUP_LABELS: Record<string, string> = {
  tenant: "Organisation",
  site: "This page",
  auth: "Sign in and register",
  nav: "Menu",
  catalog: "Catalogue",
  course: "This course",
  programme: "This programme",
  courses: "Courses",
  programmes: "Programmes",
  user: "Signed-in learner",
  progress: "Learner progress",
};

/**
 * A fully-populated context built entirely from `sample` values.
 *
 * The admin editing a page is not a learner, so `user.*` and `progress.*` have
 * no real value to show. Rather than render those branches as permanently empty
 * — which would make `{{#if user.isAuthenticated}}` impossible to preview — the
 * live preview seeds them from here, clearly labelled as sample data in the UI.
 */
export function sampleContext(): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};

  for (const v of SITE_VARIABLES) {
    if (v.kind === "list") {
      const rows = [0, 1, 2].map((i) =>
        Object.fromEntries(
          (v.fields ?? []).map((f) => [
            f.name,
            /^\d+$/.test(f.sample) ? Number(f.sample) + i : f.sample,
          ])
        )
      );
      assign(ctx, v.path, rows);
      continue;
    }
    const raw = v.sample;
    const value =
      raw === "true" ? true : raw === "false" ? false : /^\d+$/.test(raw) ? Number(raw) : raw;
    assign(ctx, v.path, value);
  }

  return ctx;
}

function assign(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof cursor[key] !== "object" || cursor[key] === null) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

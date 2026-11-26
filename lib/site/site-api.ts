/**
 * The Site API: what a tenant-designed page can DO, as opposed to show.
 *
 * A site page is HTML the academy wrote. It may not run script — staff and
 * learners share this origin, so author JavaScript would run with a staff
 * session one click away. That rule used to mean a designed page could only
 * ever be a brochure: no sign-in form, no register form, no search box.
 *
 * This file is how those come back without script. A page DECLARES a form with
 * one attribute, using field names from the lists below:
 *
 *   <form data-lms-form="login">
 *     <input name="email" type="email" required>
 *     <input name="password" type="password" required>
 *     <button type="submit">Sign in</button>
 *     <p data-lms-error></p>
 *   </form>
 *
 * and the platform's own code (components/site/site-runtime.tsx) does the rest:
 * it submits to the platform's own endpoint with a CSRF token, shows errors,
 * runs the email-code step of registration, and redirects. The author chooses
 * how the form looks; they never choose where it posts or what it sends.
 *
 * One catalogue, four readers — which is the point of keeping it in one place:
 *
 *  - the sanitizer (lib/content/sanitize-site-document.ts) allows exactly these
 *    forms, these field names and these input types, and strips `action`,
 *    `value`, `pattern` and `formaction` from everything;
 *  - the runtime submits them;
 *  - the editor offers them as snippets and validates a page before publishing;
 *  - the AI page designer's instructions are generated from them.
 *
 * Client-safe: no server imports.
 */

export type SitePageKind =
  | "PAGE"
  | "LOGIN"
  | "REGISTER"
  | "FORGOT_PASSWORD"
  | "COURSES"
  | "COURSE_DETAIL"
  | "PROGRAMME_DETAIL";

export type SiteFormKind = "login" | "register" | "forgot-password" | "search";

export type SiteFormField = {
  /** The `name` attribute. Anything else on an input inside the form is removed. */
  name: string;
  label: string;
  type: "email" | "password" | "text" | "tel" | "search";
  autocomplete: string;
  required: boolean;
  note?: string;
};

export type SiteFormDef = {
  kind: SiteFormKind;
  label: string;
  /** What submitting it does, in the author's terms. */
  purpose: string;
  fields: SiteFormField[];
  /**
   * Page kinds this form may appear on. `"any"` for forms that take nothing
   * secret. A form that takes a password is confined to its own `/auth/…` page,
   * which is served with a stricter content policy (no remote images or fonts).
   */
  allowedOn: SitePageKind[] | "any";
  /** Minimal correct markup; also what the editor inserts. */
  example: string;
};

export const SITE_FORMS: SiteFormDef[] = [
  {
    kind: "login",
    label: "Sign-in form",
    purpose: "Signs a learner in and takes them to their dashboard, or back to the page they came from.",
    allowedOn: ["LOGIN"],
    fields: [
      { name: "email", label: "Email", type: "email", autocomplete: "email", required: true },
      { name: "password", label: "Password", type: "password", autocomplete: "current-password", required: true },
    ],
    example: `<form data-lms-form="login">
  <label for="login-email">Email</label>
  <input id="login-email" name="email" type="email" autocomplete="email" required>
  <label for="login-password">Password</label>
  <input id="login-password" name="password" type="password" autocomplete="current-password" required>
  <p data-lms-error></p>
  <button type="submit">Sign in</button>
</form>`,
  },
  {
    kind: "register",
    label: "Register form",
    purpose:
      "Creates a learner account. The platform then asks for the code it emails them, and signs them in.",
    allowedOn: ["REGISTER"],
    fields: [
      { name: "firstName", label: "First name", type: "text", autocomplete: "given-name", required: true },
      { name: "lastName", label: "Last name", type: "text", autocomplete: "family-name", required: true },
      { name: "email", label: "Email", type: "email", autocomplete: "email", required: true },
      {
        name: "password",
        label: "Password",
        type: "password",
        autocomplete: "new-password",
        required: true,
        note: "At least 12 characters.",
      },
      { name: "phone", label: "Phone", type: "tel", autocomplete: "tel", required: false },
      {
        name: "referralCode",
        label: "Referral code",
        type: "text",
        autocomplete: "off",
        required: false,
        note: "Filled in automatically when the visitor arrived through a referral link.",
      },
    ],
    example: `<form data-lms-form="register">
  <label for="reg-first">First name</label>
  <input id="reg-first" name="firstName" type="text" autocomplete="given-name" required>
  <label for="reg-last">Last name</label>
  <input id="reg-last" name="lastName" type="text" autocomplete="family-name" required>
  <label for="reg-email">Email</label>
  <input id="reg-email" name="email" type="email" autocomplete="email" required>
  <label for="reg-password">Password (at least 12 characters)</label>
  <input id="reg-password" name="password" type="password" autocomplete="new-password" required>
  <p data-lms-error></p>
  <button type="submit">Create account</button>
</form>`,
  },
  {
    kind: "forgot-password",
    label: "Forgot-password form",
    purpose: "Emails the learner a link to choose a new password.",
    allowedOn: ["FORGOT_PASSWORD"],
    fields: [{ name: "email", label: "Email", type: "email", autocomplete: "email", required: true }],
    example: `<form data-lms-form="forgot-password">
  <label for="forgot-email">Email</label>
  <input id="forgot-email" name="email" type="email" autocomplete="email" required>
  <p data-lms-error></p>
  <p data-lms-success></p>
  <button type="submit">Send reset link</button>
</form>`,
  },
  {
    kind: "search",
    label: "Course search box",
    purpose: "Takes the visitor to the course catalogue, filtered by what they typed. Works on any page.",
    allowedOn: "any",
    fields: [{ name: "q", label: "Search", type: "search", autocomplete: "off", required: false }],
    example: `<form data-lms-form="search" role="search">
  <label for="course-search">Search courses</label>
  <input id="course-search" name="q" type="search">
  <button type="submit">Search</button>
</form>`,
  },
];

export const SITE_FORM_KINDS = SITE_FORMS.map((form) => form.kind);

export function findSiteForm(kind: string | null | undefined): SiteFormDef | undefined {
  return SITE_FORMS.find((form) => form.kind === kind);
}

export function formAllowedOn(form: SiteFormDef, pageKind: SitePageKind): boolean {
  return form.allowedOn === "any" || form.allowedOn.includes(pageKind);
}

/** Every field name any form accepts. An input named anything else loses its name. */
export const SITE_FIELD_NAMES = new Set(SITE_FORMS.flatMap((form) => form.fields.map((f) => f.name)));

/** Input types a site page may use at all. Notably absent: hidden, file, image, submit. */
export const SITE_INPUT_TYPES = new Set(["text", "email", "password", "search", "tel"]);

/** Whether a page of this kind may contain a password field. */
export function kindAllowsPassword(pageKind: SitePageKind): boolean {
  return SITE_FORMS.some(
    (form) => form.fields.some((f) => f.type === "password") && formAllowedOn(form, pageKind)
  );
}

/* -------------------------------------------------------------------------- */
/* Page kinds                                                                  */
/* -------------------------------------------------------------------------- */

export type SitePageKindDef = {
  kind: SitePageKind;
  label: string;
  /** What publishing a page of this kind replaces. */
  purpose: string;
  /** The address a visitor sees it at. `{slug}` stands for the course or programme. */
  path: string;
  /**
   * The slug the page is stored under. Not an address: a page of a special
   * kind is reached through `path`, never through its slug. The leading
   * underscores keep it out of the way of any page an author could name.
   */
  reservedSlug: string | null;
  /** A form the page must contain to be published. */
  requiredForm: SiteFormKind | null;
  /** Variables that only exist on this kind of page. */
  variables: string[];
};

export const SITE_PAGE_KINDS: SitePageKindDef[] = [
  {
    kind: "PAGE",
    label: "Page",
    purpose: "An ordinary page of the site: home, about, contact, anything.",
    path: "/{slug}",
    reservedSlug: null,
    requiredForm: null,
    variables: [],
  },
  {
    kind: "LOGIN",
    label: "Sign-in page",
    purpose: "Replaces the standard sign-in screen with your own design.",
    path: "/auth/login",
    reservedSlug: "__login",
    requiredForm: "login",
    variables: [],
  },
  {
    kind: "REGISTER",
    label: "Register page",
    purpose: "Replaces the standard create-account screen with your own design.",
    path: "/auth/register",
    reservedSlug: "__register",
    requiredForm: "register",
    variables: [],
  },
  {
    kind: "FORGOT_PASSWORD",
    label: "Forgot-password page",
    purpose: "Replaces the standard forgot-password screen with your own design.",
    path: "/auth/forgot-password",
    reservedSlug: "__forgot-password",
    requiredForm: "forgot-password",
    variables: [],
  },
  {
    kind: "COURSES",
    label: "Course catalogue",
    purpose: "Replaces the standard course catalogue that signed-out visitors see.",
    path: "/courses",
    reservedSlug: "__courses",
    requiredForm: null,
    variables: ["catalog.query", "catalog.count"],
  },
  {
    kind: "COURSE_DETAIL",
    label: "Course page",
    purpose: "One design used for every public course page.",
    path: "/courses/{slug}",
    reservedSlug: "__course",
    requiredForm: null,
    variables: ["course"],
  },
  {
    kind: "PROGRAMME_DETAIL",
    label: "Programme page",
    purpose: "One design used for every public programme page.",
    path: "/programmes/{slug}",
    reservedSlug: "__programme",
    requiredForm: null,
    variables: ["programme"],
  },
];

export function findPageKind(kind: string | null | undefined): SitePageKindDef {
  return SITE_PAGE_KINDS.find((k) => k.kind === kind) ?? SITE_PAGE_KINDS[0];
}

export function isSpecialKind(kind: string | null | undefined): boolean {
  return findPageKind(kind).kind !== "PAGE";
}

/* -------------------------------------------------------------------------- */
/* What a document contains, and whether that is enough                        */
/* -------------------------------------------------------------------------- */

export type FoundSiteForm = { kind: SiteFormKind; fields: string[]; hasSubmit: boolean };

/**
 * The forms in a piece of (already sanitized) markup. A light scan, good
 * enough for "is the sign-in form there, with its fields and a button" — the
 * sanitizer is what enforces the rules, not this.
 */
export function findSiteForms(html: string): FoundSiteForm[] {
  const found: FoundSiteForm[] = [];
  const formPattern = /<form\b[^>]*\bdata-lms-form\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/form\s*>/gi;
  for (const match of html.matchAll(formPattern)) {
    const def = findSiteForm(match[1]);
    if (!def) continue;
    const body = match[2];
    const fields = [...body.matchAll(/<input\b[^>]*\bname\s*=\s*"([^"]*)"/gi)].map((m) => m[1]);
    found.push({
      kind: def.kind,
      fields: [...new Set(fields)],
      hasSubmit: /<button\b(?![^>]*\btype\s*=\s*"button")[^>]*>/i.test(body),
    });
  }
  return found;
}

/**
 * Why a page of this kind cannot be published as it stands. Empty = it can.
 *
 * A sign-in page with no sign-in form would lock every learner out of the
 * academy the moment it went live, so this is checked before publishing and
 * again when the page is served — a page that fails is never shown in place of
 * the standard screen.
 */
export function pageKindProblems(kind: SitePageKind, sanitizedHtml: string): string[] {
  const def = findPageKind(kind);
  if (!def.requiredForm) return [];

  const form = findSiteForm(def.requiredForm)!;
  const present = findSiteForms(sanitizedHtml).filter((f) => f.kind === form.kind);
  if (present.length === 0) {
    return [`A ${def.label.toLowerCase()} needs a ${form.label.toLowerCase()} (data-lms-form="${form.kind}").`];
  }

  const problems: string[] = [];
  const candidate = present[0];
  for (const field of form.fields) {
    if (field.required && !candidate.fields.includes(field.name)) {
      problems.push(`The ${form.label.toLowerCase()} is missing its "${field.label}" field (name="${field.name}").`);
    }
  }
  if (!candidate.hasSubmit) problems.push(`The ${form.label.toLowerCase()} has no submit button.`);
  return problems;
}

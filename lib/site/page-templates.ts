import {
  ABOUT,
  BENEFITS,
  COURSES,
  CTA,
  FAQ,
  HERO,
  PROGRAMMES,
  PROGRESS,
  STEPS,
  document,
} from "@/lib/site/html-sections";
import {
  ABOUT_PAGE,
  CATALOGUE_LIST,
  CONTACT_PAGE,
  COURSE_OUTLINE,
  FAQ_PAGE,
  FORGOT_CARD,
  HOME_CAMPUS,
  HOME_NOTICEBOARD,
  HOME_PATHWAY,
  HOME_SPOTLIGHT,
  LOGIN_CARD,
  LOGIN_SPLIT,
  PROGRAMME_PATHWAY,
  PROGRAMMES_OVERVIEW,
  REGISTER_CARD,
  REGISTER_SPLIT,
} from "@/lib/site/template-designs";
import type { SitePageKind } from "@/lib/site/site-api";

/**
 * The designs a site page can start from.
 *
 * One registry for every kind of page: the home page and ordinary pages, and
 * the built-in screens an academy can redesign (sign-in, register, the
 * catalogue, a course page…). Each entry says which kind it is FOR, because a
 * design is only any use on the page it was made for — a home page has no
 * sign-in form, and a sign-in design on a home page would have its form
 * removed by the sanitizer.
 *
 * The four original ids (`classic`, `minimal`, `catalog`, `blank`) are kept:
 * `classic` is what a new academy's home page is seeded with, and stored
 * references to any of them must keep resolving.
 *
 * The originals are assembled from the shared sections in `html-sections.ts`
 * and double as the tutorial for the variable system. The rest are designed
 * pages in `template-designs.ts`.
 */

export type PageTemplate = {
  id: string;
  name: string;
  /** One line: what the page is, and what it is good for. */
  description: string;
  /** The kind of page this design is for. */
  kind: SitePageKind;
  /** Where it sits in a gallery of its kind; "Home" designs are offered first for a new site. */
  group: "Home" | "Pages" | "Account" | "Catalogue";
  html: () => string;
};

function classicHtml(): string {
  return document([HERO, ABOUT, BENEFITS, COURSES, STEPS]);
}

function minimalHtml(): string {
  return document([HERO, COURSES, CTA]);
}

function catalogHtml(): string {
  return document([HERO, COURSES, PROGRAMMES, PROGRESS, FAQ]);
}

function blankHtml(): string {
  return `<section style="padding: 4rem 1.25rem; max-width: 46rem; margin: 0 auto;">
  <h1>{{ tenant.name }}</h1>
  <p>Start writing. Standard HTML works, and {{ tenant.name }} is a variable: type two curly braces to see the rest.</p>
</section>
`;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  // Home pages.
  {
    id: "classic",
    name: "Classic",
    description: "Hero, about, benefits, courses and steps. What a new site starts with.",
    kind: "PAGE",
    group: "Home",
    html: classicHtml,
  },
  {
    id: "home-spotlight",
    name: "Spotlight",
    description: "The pitch and a search box beside a live list of courses open for enrolment.",
    kind: "PAGE",
    group: "Home",
    html: () => HOME_SPOTLIGHT,
  },
  {
    id: "home-pathway",
    name: "Pathway",
    description: "Built around the four steps from registering to a certificate, then programmes and courses.",
    kind: "PAGE",
    group: "Home",
    html: () => HOME_PATHWAY,
  },
  {
    id: "home-campus",
    name: "Campus",
    description: "A full-width band in your brand colour, course cards with cover images, a learner's words, contact details.",
    kind: "PAGE",
    group: "Home",
    html: () => HOME_CAMPUS,
  },
  {
    id: "home-noticeboard",
    name: "Noticeboard",
    description: "Text-led and editorial: a ruled list of courses, and a welcome back for signed-in learners.",
    kind: "PAGE",
    group: "Home",
    html: () => HOME_NOTICEBOARD,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Hero, course grid and a closing call to action.",
    kind: "PAGE",
    group: "Home",
    html: minimalHtml,
  },
  {
    id: "catalog",
    name: "Catalog",
    description: "Courses, programmes, learner progress and FAQ. Shows every family of variables at work.",
    kind: "PAGE",
    group: "Home",
    html: catalogHtml,
  },

  // Ordinary pages.
  {
    id: "about",
    name: "About",
    description: "A large opening statement, your story in two columns, and what you stand for.",
    kind: "PAGE",
    group: "Pages",
    html: () => ABOUT_PAGE,
  },
  {
    id: "contact",
    name: "Contact",
    description: "Email, phone and address, each shown only when you have filled it in.",
    kind: "PAGE",
    group: "Pages",
    html: () => CONTACT_PAGE,
  },
  {
    id: "faq",
    name: "Questions and answers",
    description: "Grouped questions that open one at a time. No script needed.",
    kind: "PAGE",
    group: "Pages",
    html: () => FAQ_PAGE,
  },
  {
    id: "programmes-overview",
    name: "Programmes and prices",
    description: "Each programme with its price and course count, then every single course with its price.",
    kind: "PAGE",
    group: "Pages",
    html: () => PROGRAMMES_OVERVIEW,
  },
  {
    id: "blank",
    name: "Blank",
    description: "An empty page with a heading. Build it yourself.",
    kind: "PAGE",
    group: "Pages",
    html: blankHtml,
  },

  // The built-in screens.
  {
    id: "login-card",
    name: "Sign in: card",
    description: "One quiet card in the middle of the page, with your logo.",
    kind: "LOGIN",
    group: "Account",
    html: () => LOGIN_CARD,
  },
  {
    id: "login-split",
    name: "Sign in: split",
    description: "Your brand colour and a welcome on one side, the form on the other.",
    kind: "LOGIN",
    group: "Account",
    html: () => LOGIN_SPLIT,
  },
  {
    id: "register-card",
    name: "Register: card",
    description: "A single card with every field, including phone and referral code.",
    kind: "REGISTER",
    group: "Account",
    html: () => REGISTER_CARD,
  },
  {
    id: "register-split",
    name: "Register: split",
    description: "What an account gives a learner on one side, the form on the other.",
    kind: "REGISTER",
    group: "Account",
    html: () => REGISTER_SPLIT,
  },
  {
    id: "forgot-card",
    name: "Forgot password: card",
    description: "One field and a clear confirmation.",
    kind: "FORGOT_PASSWORD",
    group: "Account",
    html: () => FORGOT_CARD,
  },
  {
    id: "catalogue-list",
    name: "Catalogue: list",
    description: "A search box and a ruled list of courses with prices, instead of cards.",
    kind: "COURSES",
    group: "Catalogue",
    html: () => CATALOGUE_LIST,
  },
  {
    id: "course-outline",
    name: "Course: outline",
    description: "Title and description beside a price panel that stays in view, then the numbered outline.",
    kind: "COURSE_DETAIL",
    group: "Catalogue",
    html: () => COURSE_OUTLINE,
  },
  {
    id: "programme-pathway",
    name: "Programme: pathway",
    description: "A band in your brand colour with price and course count, then the courses as a numbered path.",
    kind: "PROGRAMME_DETAIL",
    group: "Catalogue",
    html: () => PROGRAMME_PATHWAY,
  },
];

/** The ids that existed before designs were tied to page kinds. They must keep resolving. */
export const ORIGINAL_TEMPLATE_IDS = ["classic", "minimal", "catalog", "blank"] as const;

export type PageTemplateId = string;

export const PAGE_TEMPLATE_IDS = PAGE_TEMPLATES.map((t) => t.id) as [string, ...string[]];

export function getPageTemplate(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}

/** The designs made for a page of this kind. */
export function templatesForKind(kind: SitePageKind): PageTemplate[] {
  return PAGE_TEMPLATES.filter((t) => t.kind === kind);
}

/** What the galleries need to list a design, without its markup. */
export type PageTemplateSummary = Pick<PageTemplate, "id" | "name" | "description" | "kind" | "group">;

export function templateSummaries(): PageTemplateSummary[] {
  return PAGE_TEMPLATES.map(({ id, name, description, kind, group }) => ({ id, name, description, kind, group }));
}

/** The document a tenant's home page is seeded with. */
export function classicHomeHtml(): string {
  return classicHtml();
}

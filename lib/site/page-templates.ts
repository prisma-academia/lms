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

/**
 * Starter documents for a new site page.
 *
 * These used to return block arrays. They now return HTML, and they are written
 * to double as the tutorial for the variable system — `catalog` in particular
 * exists to show an author what `{{#each courses}}` and `{{#each programmes}}`
 * look like in a real page, since that is not something a blank editor teaches.
 */

export type PageTemplateId = "classic" | "minimal" | "catalog" | "blank";

export type PageTemplate = {
  id: PageTemplateId;
  name: string;
  description: string;
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
  <p>Start writing. Standard HTML works, and {{ variables }} pull in live data.</p>
</section>
`;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Hero, about, benefits, courses, and steps — matches the default landing.",
    html: classicHtml,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Hero, course grid, and a closing call to action.",
    html: minimalHtml,
  },
  {
    id: "catalog",
    name: "Catalog",
    description: "Courses, programmes, learner progress, and FAQ — shows every variable family.",
    html: catalogHtml,
  },
  {
    id: "blank",
    name: "Blank",
    description: "An empty page with a heading. Build it yourself.",
    html: blankHtml,
  },
];

export const PAGE_TEMPLATE_IDS = PAGE_TEMPLATES.map((t) => t.id) as [
  PageTemplateId,
  ...PageTemplateId[],
];

export function getPageTemplate(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}

/** The document a tenant's home page is seeded with. */
export function classicHomeHtml(): string {
  return classicHtml();
}

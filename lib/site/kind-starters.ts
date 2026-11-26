import { findSiteForm, type SitePageKind } from "./site-api";

/**
 * What a new page of each special kind starts as.
 *
 * Deliberately plain: a working page an author can publish as it is and then
 * restyle, not a design. Every starter passes `pageKindProblems` for its kind —
 * `npm run verify:site-builder` checks that — so "create, publish" never
 * produces a sign-in page nobody can sign in through.
 *
 * Colours come from `--sb-brand` (the academy's brand colour, set on the page
 * container) and `currentColor`, so a starter fits whatever theme it lands in.
 */

const BASE_CSS = `
  .lms-wrap { max-width: 68rem; margin: 0 auto; padding: 3rem 1.25rem; }
  .lms-narrow { max-width: 26rem; }
  .lms-title { font-size: clamp(1.75rem, 4vw, 2.5rem); line-height: 1.15; margin: 0 0 .5rem; }
  .lms-lead { font-size: 1.0625rem; line-height: 1.6; opacity: .8; margin: 0 0 1.75rem; }
  .lms-form { display: grid; gap: .875rem; }
  .lms-form label { font-size: .875rem; font-weight: 700; }
  .lms-form input { width: 100%; padding: .75rem .875rem; border: 2px solid currentColor; border-radius: 10px; font: inherit; background: transparent; color: inherit; }
  .lms-form input:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 2px; }
  .lms-btn { display: inline-block; padding: .8rem 1.25rem; border: 2px solid var(--sb-brand); border-radius: 10px; background: var(--sb-brand); color: #fff; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; }
  .lms-btn:focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
  .lms-btn[disabled] { opacity: .6; cursor: progress; }
  /* The app resets link underlines, heading margins and weights, so a starter
     states the ones it relies on rather than trusting browser defaults. */
  .lms-wrap a { text-decoration: underline; text-underline-offset: 3px; }
  .lms-wrap a.lms-btn, .lms-wrap a.lms-card { text-decoration: none; }
  .lms-wrap h1, .lms-wrap h2, .lms-wrap h3 { font-weight: 800; }
  .lms-wrap h2 { margin: 2rem 0 .75rem; font-size: 1.25rem; }
  .lms-wrap p { margin: 0 0 1rem; }
  .lms-quiet { font-size: .9375rem; }
  .lms-quiet a { font-weight: 700; }
  [data-lms-error] { margin: 0; padding: .625rem .75rem; border: 2px solid #b42318; border-radius: 10px; color: #b42318; font-weight: 700; font-size: .9375rem; }
  [data-lms-success] { margin: 0; padding: .625rem .75rem; border: 2px solid var(--sb-brand); border-radius: 10px; font-weight: 700; font-size: .9375rem; }
  .lms-grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); }
  .lms-card { display: flex; flex-direction: column; gap: .5rem; padding: 1.125rem; border: 2px solid currentColor; border-radius: 14px; text-decoration: none; color: inherit; }
  .lms-card h2, .lms-card h3 { margin: 0; font-size: 1.125rem; line-height: 1.3; }
  .lms-card p { margin: 0; font-size: .9375rem; line-height: 1.55; opacity: .8; }
  .lms-meta { font-size: .875rem; font-weight: 700; }
  .lms-list { margin: 0; padding: 0; list-style: none; border: 2px solid currentColor; border-radius: 14px; }
  .lms-list li { display: flex; justify-content: space-between; gap: 1rem; padding: .75rem 1rem; }
  .lms-list li + li { border-top: 1px solid currentColor; }
  .lms-search { display: flex; gap: .5rem; margin: 0 0 1.5rem; max-width: 30rem; }
  .lms-search input { flex: 1; padding: .7rem .875rem; border: 2px solid currentColor; border-radius: 10px; font: inherit; background: transparent; color: inherit; }
`;

function indent(markup: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return markup
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

function formMarkup(kind: "login" | "register" | "forgot-password"): string {
  // The catalogue's own example, given the starter's class so it is styled.
  return findSiteForm(kind)!.example.replace(`<form data-lms-form="${kind}"`, `<form class="lms-form" data-lms-form="${kind}"`).replace(
    `<button type="submit">`,
    `<button class="lms-btn" type="submit">`
  );
}

const STARTERS: Record<Exclude<SitePageKind, "PAGE">, { title: string; html: () => string }> = {
  LOGIN: {
    title: "Sign in",
    html: () => `<style>${BASE_CSS}</style>
<section class="lms-wrap lms-narrow">
  <h1 class="lms-title">Sign in</h1>
  <p class="lms-lead">Welcome back to {{ tenant.name }}.</p>
${indent(formMarkup("login"), 2)}
  <p class="lms-quiet"><a href="{{ auth.forgotPasswordUrl }}">Forgot your password?</a></p>
  <p class="lms-quiet">New here? <a href="{{ auth.registerUrl }}">Create an account</a></p>
</section>`,
  },
  REGISTER: {
    title: "Create an account",
    html: () => `<style>${BASE_CSS}</style>
<section class="lms-wrap lms-narrow">
  <h1 class="lms-title">Create your account</h1>
  <p class="lms-lead">Join {{ tenant.name }}. We'll email you a code to confirm your address.</p>
${indent(formMarkup("register"), 2)}
  <p class="lms-quiet">Already have an account? <a href="{{ auth.loginUrl }}">Sign in</a></p>
</section>`,
  },
  FORGOT_PASSWORD: {
    title: "Forgot password",
    html: () => `<style>${BASE_CSS}</style>
<section class="lms-wrap lms-narrow">
  <h1 class="lms-title">Forgot your password?</h1>
  <p class="lms-lead">Enter your email and we'll send you a link to choose a new one.</p>
${indent(formMarkup("forgot-password"), 2)}
  <p class="lms-quiet"><a href="{{ auth.loginUrl }}">Back to sign in</a></p>
</section>`,
  },
  COURSES: {
    title: "Courses",
    html: () => `<style>${BASE_CSS}</style>
<section class="lms-wrap">
  <h1 class="lms-title">Courses</h1>
  <p class="lms-lead">Everything you can study at {{ tenant.name }}.</p>
  <form class="lms-search" data-lms-form="search" role="search">
    <label for="course-search" style="position:absolute;left:-9999px">Search courses</label>
    <input id="course-search" name="q" type="search" placeholder="Search courses">
    <button class="lms-btn" type="submit">Search</button>
  </form>
  {{#if catalog.query}}<p class="lms-meta">{{ catalog.count }} found for “{{ catalog.query }}” · <a href="{{ catalog.coursesUrl }}">Show all</a></p>{{/if}}
  <div class="lms-grid">
    {{#each courses}}
    <a class="lms-card" href="{{ this.url }}">
      <h2>{{ this.title }}</h2>
      <p>{{ this.description }}</p>
      <span class="lms-meta">{{ this.price }} · {{ this.lessonCount }} lessons</span>
    </a>
    {{/each}}
  </div>
</section>`,
  },
  COURSE_DETAIL: {
    title: "Course page",
    html: () => `<style>${BASE_CSS}</style>
<section class="lms-wrap">
  <p class="lms-quiet"><a href="{{ catalog.coursesUrl }}">All courses</a></p>
  <h1 class="lms-title">{{ course.title }}</h1>
  <p class="lms-lead">{{ course.description }}</p>
  <p class="lms-meta">{{ course.price }} · {{ course.lessonCount }} lessons</p>
  <p>
    {{#if user.isAuthenticated}}
    <a class="lms-btn" href="{{ course.url }}">Go to this course</a>
    {{else}}
    <a class="lms-btn" href="{{ course.joinUrl }}">Register to enrol</a>
    <a class="lms-quiet" href="{{ course.signInUrl }}">or sign in</a>
    {{/if}}
  </p>
  <h2>What you will cover</h2>
  <ol class="lms-list">
    {{#each course.lessons}}
    <li><span>{{ this.title }}</span><span class="lms-meta">{{ this.kind }}</span></li>
    {{/each}}
  </ol>
</section>`,
  },
  PROGRAMME_DETAIL: {
    title: "Programme page",
    html: () => `<style>${BASE_CSS}</style>
<section class="lms-wrap">
  <h1 class="lms-title">{{ programme.title }}</h1>
  <p class="lms-lead">{{ programme.description }}</p>
  <p class="lms-meta">{{ programme.price }} · {{ programme.courseCount }} courses</p>
  <p>
    {{#if user.isAuthenticated}}
    <a class="lms-btn" href="{{ auth.dashboardUrl }}">Go to my dashboard</a>
    {{else}}
    <a class="lms-btn" href="{{ programme.joinUrl }}">Register to enrol</a>
    <a class="lms-quiet" href="{{ programme.signInUrl }}">or sign in</a>
    {{/if}}
  </p>
  <h2>Courses in this programme</h2>
  <div class="lms-grid">
    {{#each programme.courses}}
    <div class="lms-card">
      <h3>{{ this.title }}</h3>
      <p>{{ this.description }}</p>
      <span class="lms-meta">{{ this.lessonCount }} lessons</span>
    </div>
    {{/each}}
  </div>
</section>`,
  },
};

export function kindStarter(kind: Exclude<SitePageKind, "PAGE">): { title: string; html: string } {
  const starter = STARTERS[kind];
  return { title: starter.title, html: starter.html() };
}

/**
 * The built-in header, written as an author would write one — what "start from
 * the default" loads into the header editor, so customising it begins from
 * something that already works rather than from an empty box.
 */
export function defaultHeaderHtml(): string {
  return `<style>
  .site-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem 1.5rem; max-width: 72rem; margin: 0 auto; padding: .875rem 1.25rem; }
  .site-brand { display: flex; align-items: center; gap: .625rem; font-weight: 800; font-size: 1.0625rem; text-decoration: none; color: inherit; }
  .site-brand img { height: 1.75rem; width: auto; }
  .site-nav { display: flex; flex-wrap: wrap; gap: .25rem 1.125rem; }
  .site-nav a { font-size: .9375rem; font-weight: 600; text-decoration: none; color: inherit; }
  .site-nav a[aria-current="page"] { text-decoration: underline; text-underline-offset: 6px; }
  .site-actions { display: flex; align-items: center; gap: .5rem; }
  .site-actions a { padding: .5rem .875rem; border: 2px solid var(--sb-brand); border-radius: 10px; font-size: .9375rem; font-weight: 800; text-decoration: none; color: inherit; }
  .site-actions a.primary { background: var(--sb-brand); color: #fff; }
</style>
<div class="site-head">
  <a class="site-brand" href="/">
    {{#if tenant.logoUrl}}<img src="{{ tenant.logoUrl }}" alt="">{{/if}}
    <span>{{ tenant.name }}</span>
  </a>
  <nav class="site-nav" aria-label="Site">
    <a href="{{ catalog.coursesUrl }}">Courses</a>
    {{#each nav}}<a href="{{ this.url }}">{{ this.title }}</a>{{/each}}
  </nav>
  <div class="site-actions">
    {{#if user.isAuthenticated}}
    <a class="primary" href="{{ auth.dashboardUrl }}">My dashboard</a>
    {{else}}
    <a href="{{ auth.loginUrl }}">Sign in</a>
    <a class="primary" href="{{ auth.registerUrl }}">Register</a>
    {{/if}}
  </div>
</div>`;
}

export function defaultFooterHtml(): string {
  return `<style>
  .site-foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem 2rem; max-width: 72rem; margin: 0 auto; padding: 2rem 1.25rem; font-size: .9375rem; }
  .site-foot p { margin: 0 0 .25rem; }
  .site-foot nav { display: flex; flex-wrap: wrap; gap: .25rem 1.125rem; }
  .site-foot a { color: inherit; font-weight: 600; }
</style>
<div class="site-foot">
  <div>
    <p><strong>{{ tenant.name }}</strong></p>
    {{#if tenant.address}}<p>{{ tenant.address }}</p>{{/if}}
    {{#if tenant.email}}<p><a href="mailto:{{ tenant.email }}">{{ tenant.email }}</a></p>{{/if}}
    {{#if tenant.phone}}<p>{{ tenant.phone }}</p>{{/if}}
  </div>
  <nav aria-label="Footer">
    <a href="{{ catalog.coursesUrl }}">Courses</a>
    {{#each nav}}<a href="{{ this.url }}">{{ this.title }}</a>{{/each}}
    <a href="{{ auth.loginUrl }}">Sign in</a>
  </nav>
  <p>© {{ site.year }} {{ tenant.name }}</p>
</div>`;
}

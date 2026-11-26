/**
 * Ready-made HTML sections for the site builder.
 *
 * These serve three callers at once, which is why they live in their own module
 * rather than inside the templates:
 *
 *  1. The starter page templates (`page-templates.ts`).
 *  2. The playground's snippet palette — the HTML replacements for the blocks
 *     the old builder offered, so nobody has to write a course grid from
 *     scratch to get what "Add a courses block" used to give them.
 *  3. `blocks-to-html.ts`, which converts existing block pages during migration.
 *
 * Every section carries its own scoped `<style>`. That works because
 * `sanitizeSiteDocument` lifts each `<style>` out and rewrites its selectors to
 * sit under the page's `data-css-scope`, so these rules can never reach the
 * admin chrome or the site nav — see `lib/content/sanitize-css.ts`.
 *
 * They are plain strings, not components. The whole point of the rewrite is that
 * an author owns the markup and can edit any of it; a component would hand back
 * exactly the black box the block editor already was.
 */

export const BASE_STYLES = `<style>
  .sb-wrap { max-width: 72rem; margin: 0 auto; padding: 0 1.25rem; }
  .sb-narrow { max-width: 46rem; margin: 0 auto; padding: 0 1.25rem; }
  .sb-section { padding: 3.5rem 0; border-top: 2px solid var(--border, #e7e5e4); }
  .sb-eyebrow { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; opacity: .6; }
  .sb-h1 { font-size: clamp(2rem, 5vw, 3.25rem); line-height: 1.1; margin: .5rem 0; }
  .sb-h2 { font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.2; margin: 0 0 .5rem; }
  .sb-lead { font-size: 1.05rem; opacity: .75; max-width: 40rem; }
  .sb-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }
  .sb-card { border: 2px solid var(--border, #e7e5e4); border-radius: 14px; padding: 1.25rem; background: var(--card, #fff); }
  .sb-card img { width: 100%; height: 10rem; object-fit: cover; border-radius: 10px; margin-bottom: .75rem; }
  .sb-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.5rem; }
  .sb-btn { display: inline-block; padding: .7rem 1.4rem; border-radius: 10px; border: 2px solid currentColor; text-decoration: none; font-weight: 600; }
  .sb-btn-primary { background: var(--sb-brand, #1c1917); color: #fff; border-color: var(--sb-brand, #1c1917); }
  .sb-muted { opacity: .7; }
  /* The page these land on has no default margins, bullets, underlines or bold
     sub-headings (the application resets them), so the sections say what they need. */
  .sb-section h3 { margin: 0 0 .375rem; font-size: 1.0625rem; font-weight: 700; line-height: 1.3; }
  .sb-section p { margin: 0 0 .75rem; line-height: 1.6; }
  .sb-section ol { margin: 1rem 0 0; padding-left: 1.25rem; list-style: decimal; }
  .sb-section ol li { margin-bottom: .5rem; line-height: 1.6; }
  .sb-section a { text-decoration: underline; text-underline-offset: 3px; }
  .sb-section a.sb-btn { text-decoration: none; }
  .sb-section details { padding: .875rem 0; border-top: 1px solid var(--border, #e7e5e4); }
  .sb-section summary { font-weight: 700; cursor: pointer; }
  .sb-section details p { margin: .5rem 0 0; }
  .sb-center { text-align: center; }
  .sb-hero { position: relative; overflow: hidden; }
  .sb-hero-inner { position: relative; }
  /*
   * The overlay lives on the background layer rather than on the section, so the
   * headline sits above it. A photograph with no scrim behind white text is the
   * single most common way a landing page ends up unreadable.
   */
  .sb-hero-bg {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
  }
  .sb-hero-bg::after {
    content: "";
    position: absolute;
    inset: 0;
    /* The page's own background, so the scrim is light on a light theme and
       dark on a dark one — a fixed white scrim under light text is unreadable. */
    background: var(--background, #fff);
    opacity: .78;
  }
  .sb-quote { margin: 0; font-size: clamp(1.25rem, 2.6vw, 1.75rem); line-height: 1.35; }
  .sb-quote-by { margin-top: 1rem; font-weight: 700; }
  .sb-search { display: flex; flex-wrap: wrap; gap: .5rem; max-width: 34rem; margin-top: 1.25rem; }
  .sb-search input { flex: 1 1 12rem; padding: .7rem .875rem; border: 2px solid var(--border, #e7e5e4); border-radius: 10px; font: inherit; background: var(--card, #fff); color: inherit; }
  .sb-search input:focus-visible { outline: 3px solid var(--sb-brand, #1c1917); outline-offset: 2px; }
  .sb-btn:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
  .sb-contact { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); }
  .sb-hero:has(.sb-hero-bg) { padding: 5rem 0; }
</style>`;

/**
 * The hero, with an optional background photograph.
 *
 * The image is a `{{#if}}` branch rather than a required asset: most tenants
 * never upload one, and a hero that collapses to a coloured band with no photo
 * is the correct fallback — not a broken image or an empty box. The overlay is
 * what keeps the headline legible over an arbitrary photograph the author picked
 * without thinking about contrast, which is every photograph.
 */
export const HERO = `<section class="sb-section sb-hero" style="border-top: 0;">
  {{#if tenant.heroImageUrl}}
    <div class="sb-hero-bg" style="background-image: url('{{ tenant.heroImageUrl }}');"></div>
  {{/if}}
  <div class="sb-wrap sb-center sb-hero-inner">
    {{#if tenant.logoUrl}}
      <img src="{{ tenant.logoUrl }}" alt="{{ tenant.name }}" style="height: 4rem; margin: 0 auto 1rem;">
    {{/if}}
    <p class="sb-eyebrow">{{ tenant.location }}</p>
    <h1 class="sb-h1">{{ tenant.name }}</h1>
    <p class="sb-lead" style="margin: 0 auto;">
      Welcome to your learning home. Enroll in courses, track your progress, and grow with us.
    </p>
    <div class="sb-actions" style="justify-content: center;">
      {{#if user.isAuthenticated}}
        <a class="sb-btn sb-btn-primary" href="{{ auth.dashboardUrl }}">Go to my dashboard</a>
      {{else}}
        <a class="sb-btn sb-btn-primary" href="{{ auth.registerUrl }}">Register</a>
        <a class="sb-btn" href="{{ auth.loginUrl }}">Sign in</a>
      {{/if}}
    </div>
  </div>
</section>`;

export const COURSES = `<section class="sb-section" id="courses">
  <div class="sb-wrap">
    <h2 class="sb-h2">Featured courses</h2>
    <div class="sb-grid">
      {{#each courses}}
        <article class="sb-card">
          {{#if this.thumbnailUrl}}<img src="{{ this.thumbnailUrl }}" alt="{{ this.title }}">{{/if}}
          <h3>{{ this.title }}</h3>
          <p class="sb-muted">{{ this.description }}</p>
          <p><strong>{{ this.price }}</strong> &middot; {{ this.lessonCount }} lessons</p>
          <a class="sb-btn" href="{{ this.url }}">View course</a>
        </article>
      {{/each}}
    </div>
  </div>
</section>`;

export const PROGRAMMES = `<section class="sb-section" id="programmes">
  <div class="sb-wrap">
    <h2 class="sb-h2">Programmes</h2>
    <div class="sb-grid">
      {{#each programmes}}
        <article class="sb-card">
          {{#if this.thumbnailUrl}}<img src="{{ this.thumbnailUrl }}" alt="{{ this.title }}">{{/if}}
          <h3>{{ this.title }}</h3>
          <p class="sb-muted">{{ this.description }}</p>
          <p><strong>{{ this.price }}</strong> &middot; {{ this.courseCount }} courses</p>
          <a class="sb-btn" href="{{ this.url }}">View programme</a>
        </article>
      {{/each}}
    </div>
  </div>
</section>`;

export const PROGRESS = `<section class="sb-section">
  <div class="sb-wrap">
    {{#if user.isAuthenticated}}
      <h2 class="sb-h2">Welcome back, {{ user.name }}</h2>
      <p class="sb-lead">
        You are enrolled in {{ progress.enrollmentCount }} courses and have completed
        {{ progress.completedCount }} of them — {{ progress.averagePercent }}% on average.
      </p>
      <div class="sb-grid">
        {{#each progress.enrollments}}
          <article class="sb-card">
            <h3>{{ this.courseTitle }}</h3>
            <p class="sb-muted">{{ this.percent }}% complete</p>
            <a class="sb-btn" href="{{ this.url }}">Continue</a>
          </article>
        {{/each}}
      </div>
    {{else}}
      <h2 class="sb-h2">Track your progress</h2>
      <p class="sb-lead">Sign in to pick up exactly where you left off.</p>
      <div class="sb-actions"><a class="sb-btn sb-btn-primary" href="{{ auth.loginUrl }}">Sign in</a></div>
    {{/if}}
  </div>
</section>`;

export const ABOUT = `<section class="sb-section">
  <div class="sb-narrow">
    <h2 class="sb-h2">About us</h2>
    <p class="sb-lead">
      {{ tenant.name }} helps learners build real skills through structured courses,
      practical assessment, and certificates that mean something.
    </p>
    <p class="sb-muted">
      {{#if tenant.email}}<a href="mailto:{{ tenant.email }}">{{ tenant.email }}</a><br>{{/if}}
      {{#if tenant.phone}}<a href="tel:{{ tenant.phone }}">{{ tenant.phone }}</a><br>{{/if}}
      {{#if tenant.address}}{{ tenant.address }}{{/if}}
    </p>
  </div>
</section>`;

export const BENEFITS = `<section class="sb-section">
  <div class="sb-wrap">
    <h2 class="sb-h2 sb-center">Why learn with us</h2>
    <div class="sb-grid">
      <div class="sb-card">
        <h3>Structured courses</h3>
        <p class="sb-muted">Clear lessons, quizzes, and progress tracking so you always know what is next.</p>
      </div>
      <div class="sb-card">
        <h3>Learn anywhere</h3>
        <p class="sb-muted">Access your courses from any device and pick up where you left off.</p>
      </div>
      <div class="sb-card">
        <h3>Certificates</h3>
        <p class="sb-muted">Earn recognition when you complete programmes and demonstrate mastery.</p>
      </div>
    </div>
  </div>
</section>`;

export const STEPS = `<section class="sb-section">
  <div class="sb-narrow">
    <h2 class="sb-h2 sb-center">How it works</h2>
    <ol>
      <li><strong>Create an account.</strong> Register in minutes and join our learning community.</li>
      <li><strong>Enroll in a course.</strong> Browse the catalog and start learning right away.</li>
      <li><strong>Track your progress.</strong> Complete lessons, submit work, and earn certificates.</li>
    </ol>
    <div class="sb-actions" style="justify-content: center;">
      <a class="sb-btn sb-btn-primary" href="{{ auth.registerUrl }}">Get started</a>
    </div>
  </div>
</section>`;

export const FAQ = `<section class="sb-section">
  <div class="sb-narrow">
    <h2 class="sb-h2">Frequently asked questions</h2>
    <details><summary>How do I enroll?</summary>
      <p>Create an account, then open any course and follow the enrollment steps.</p></details>
    <details><summary>Are courses free?</summary>
      <p>Some courses are free; paid courses show their price on the course card.</p></details>
  </div>
</section>`;

export const CTA = `<section class="sb-section sb-center">
  <div class="sb-narrow">
    <h2 class="sb-h2">Ready to begin?</h2>
    <p class="sb-lead" style="margin: 0 auto;">Create your account and enroll in minutes.</p>
    <div class="sb-actions" style="justify-content: center;">
      <a class="sb-btn sb-btn-primary" href="{{ auth.registerUrl }}">Register</a>
      <a class="sb-btn" href="{{ catalog.coursesUrl }}">Browse courses</a>
    </div>
  </div>
</section>`;

export const TESTIMONIAL = `<section class="sb-section">
  <div class="sb-narrow">
    <blockquote class="sb-quote">
      “I finished the course in three weeks of evenings, and used what I learned at work the Monday after.”
    </blockquote>
    <p class="sb-quote-by">A learner's name <span class="sb-muted">— their role or course</span></p>
  </div>
</section>`;

export const CONTACT = `<section class="sb-section" id="contact">
  <div class="sb-wrap">
    <h2 class="sb-h2">Get in touch</h2>
    <div class="sb-contact">
      {{#if tenant.email}}
        <div class="sb-card"><h3>Email</h3><p><a href="mailto:{{ tenant.email }}">{{ tenant.email }}</a></p></div>
      {{/if}}
      {{#if tenant.phone}}
        <div class="sb-card"><h3>Phone</h3><p><a href="tel:{{ tenant.phone }}">{{ tenant.phone }}</a></p></div>
      {{/if}}
      {{#if tenant.address}}
        <div class="sb-card"><h3>Visit</h3><p>{{ tenant.address }}</p></div>
      {{/if}}
    </div>
  </div>
</section>`;

export const SEARCH = `<section class="sb-section">
  <div class="sb-wrap">
    <h2 class="sb-h2">Find a course</h2>
    <form class="sb-search" data-lms-form="search" role="search">
      <input name="q" type="search" placeholder="Search courses…" aria-label="Search courses">
      <button class="sb-btn sb-btn-primary" type="submit">Search</button>
    </form>
  </div>
</section>`;

export const RICH_TEXT = `<section class="sb-section">
  <div class="sb-narrow">
    <h2 class="sb-h2">A heading</h2>
    <p>Write anything here. Standard HTML works, and so do {{ tenant.name }} variables.</p>
  </div>
</section>`;

/** The snippet palette shown in the immersive playground. */
export const SNIPPETS: { id: string; name: string; description: string; html: string }[] = [
  { id: "hero", name: "Hero", description: "Logo, headline, and two calls to action.", html: HERO },
  { id: "courses", name: "Course grid", description: "Loops over published public courses.", html: COURSES },
  { id: "programmes", name: "Programme grid", description: "Loops over published public programmes.", html: PROGRAMMES },
  { id: "progress", name: "Learner progress", description: "Shows the signed-in learner's progress, with a signed-out fallback.", html: PROGRESS },
  { id: "about", name: "About / contact", description: "Organisation blurb with contact details.", html: ABOUT },
  { id: "benefits", name: "Benefits", description: "Three-up card row.", html: BENEFITS },
  { id: "steps", name: "Steps", description: "Numbered how-it-works list.", html: STEPS },
  { id: "faq", name: "FAQ", description: "Collapsible question list.", html: FAQ },
  { id: "cta", name: "Call to action", description: "Closing prompt with a button.", html: CTA },
  { id: "testimonial", name: "Testimonial", description: "One learner's words, set large.", html: TESTIMONIAL },
  { id: "contact", name: "Contact", description: "Email, phone and address, each shown only if filled in.", html: CONTACT },
  { id: "search", name: "Course search", description: "A search box that opens the course catalogue.", html: SEARCH },
  { id: "richText", name: "Text section", description: "A plain heading and paragraph to edit.", html: RICH_TEXT },
  { id: "styles", name: "Base styles", description: "The .sb-* stylesheet the other snippets use.", html: BASE_STYLES },
];

/** The class every ready-made section relies on; its presence means the stylesheet is there. */
const BASE_STYLES_MARKER = ".sb-wrap";

/**
 * A ready-made section, made safe to drop into any page.
 *
 * The sections share one stylesheet. On a page built from them it is already
 * there; on a page the author wrote from scratch (or one of the designed
 * templates) it is not, and the section would arrive unstyled — so in that
 * case the stylesheet comes with it.
 */
export function sectionWithStyles(source: string, snippetHtml: string): string {
  if (snippetHtml === BASE_STYLES || source.includes(BASE_STYLES_MARKER)) return snippetHtml;
  return `${BASE_STYLES}\n\n${snippetHtml}`;
}

/** The sections offered by "Insert section" — everything in the palette except the stylesheet itself. */
export function sectionLibrary() {
  return SNIPPETS.filter((snippet) => snippet.id !== "styles");
}

/** Wrap sections into a complete document with the shared stylesheet. */
export function document(sections: string[]): string {
  return [BASE_STYLES, ...sections].join("\n\n") + "\n";
}

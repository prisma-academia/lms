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
  .sb-btn-primary { background: var(--sb-brand, #0f172a); color: #fff; border-color: var(--sb-brand, #0f172a); }
  .sb-muted { opacity: .7; }
  .sb-center { text-align: center; }
</style>`;

export const HERO = `<section class="sb-section" style="border-top: 0;">
  <div class="sb-wrap sb-center">
    {{#if tenant.logoUrl}}
      <img src="{{ tenant.logoUrl }}" alt="{{ tenant.name }}" style="height: 4rem; margin: 0 auto 1rem;">
    {{/if}}
    <p class="sb-eyebrow">{{ tenant.location }}</p>
    <h1 class="sb-h1">{{ tenant.name }}</h1>
    <p class="sb-lead" style="margin: 0 auto;">
      Welcome to your learning home. Enroll in courses, track your progress, and grow with us.
    </p>
    <div class="sb-actions" style="justify-content: center;">
      <a class="sb-btn sb-btn-primary" href="/auth/register">Enroll now</a>
      <a class="sb-btn" href="/auth/login">Sign in</a>
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
      <div class="sb-actions"><a class="sb-btn sb-btn-primary" href="/auth/login">Sign in</a></div>
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
      <a class="sb-btn sb-btn-primary" href="/auth/register">Get started</a>
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
      <a class="sb-btn sb-btn-primary" href="/auth/register">Enroll now</a>
    </div>
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
  { id: "richText", name: "Text section", description: "A plain heading and paragraph to edit.", html: RICH_TEXT },
  { id: "styles", name: "Base styles", description: "The .sb-* stylesheet the other snippets use.", html: BASE_STYLES },
];

/** Wrap sections into a complete document with the shared stylesheet. */
export function document(sections: string[]): string {
  return [BASE_STYLES, ...sections].join("\n\n") + "\n";
}

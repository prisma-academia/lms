/**
 * The designed starting points for site pages.
 *
 * Each one is a complete page an academy could publish as it is: its own
 * layout idea, its own stylesheet, real structure. They are written the way an
 * author would write a page — plain HTML, one `<style>` block, `{{ variables }}`
 * for the academy's own facts — because the first thing an author does with a
 * template is open it and change it.
 *
 * Rules every design keeps (checked by `npm run verify:site-builder`):
 *
 *  - Colour comes from the academy, not from the template: `--sb-brand` for the
 *    brand colour, `currentColor` and the theme's own surface tokens for
 *    everything else. No brand hex codes, so a design never fights the theme
 *    it lands in, light or dark.
 *  - System fonts only, and no remote assets of any kind.
 *  - Nothing the sanitizer would remove, and no variable that does not exist.
 *  - Sign-in and register pages contain a working form for their kind.
 *  - Readable from a 360px phone upward.
 *
 * Classes are prefixed per design so two designs' rules can never collide when
 * an author pastes part of one into another.
 *
 * Written for the page they land on, not for a bare browser. A site page is
 * shown inside the application, whose base stylesheet has already reset every
 * element: no default margins, no list bullets, no link underlines, headings
 * the size and weight of body text (and `h1`/`h2` in the academy's display
 * face). So nothing here leans on a browser default — every margin, weight,
 * underline and bullet a design needs, it sets.
 */

/** Serif stack for the designs that want an editorial voice. System fonts only. */
const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`;

/* -------------------------------------------------------------------------- */
/* Home pages                                                                  */
/* -------------------------------------------------------------------------- */

/** Split hero: the pitch on the left, a short list of real courses on the right. */
export const HOME_SPOTLIGHT = `<style>
  .sp-wrap { max-width: 74rem; margin: 0 auto; padding: 0 1.25rem; }
  .sp-hero { display: grid; gap: 2.5rem; align-items: center; padding: clamp(2.5rem, 7vw, 5.5rem) 0; }
  @media (min-width: 60rem) { .sp-hero { grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); } }
  .sp-kicker { margin: 0 0 .75rem; font-weight: 700; color: var(--sb-brand); }
  .sp-title { margin: 0; font-size: clamp(2.25rem, 6vw, 4rem); line-height: 1.04; letter-spacing: -.025em; text-wrap: balance; }
  .sp-lead { margin: 1.25rem 0 0; max-width: 34rem; font-size: 1.125rem; line-height: 1.6; opacity: .8; }
  .sp-search { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1.75rem; max-width: 32rem; }
  .sp-search input { flex: 1 1 12rem; min-width: 0; padding: .8rem 1rem; border: 2px solid var(--border, currentColor); border-radius: 12px; background: var(--card, transparent); color: inherit; font: inherit; }
  .sp-search input:focus-visible, .sp-btn:focus-visible, .sp-row:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 3px; }
  .sp-btn { display: inline-block; padding: .8rem 1.25rem; border: 2px solid var(--sb-brand); border-radius: 12px; background: var(--sb-brand); color: #fff; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; }
  .sp-btn-quiet { background: transparent; color: inherit; border-color: var(--border, currentColor); }
  .sp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin-top: 1.25rem; }
  .sp-panel { border: 2px solid var(--border, currentColor); border-radius: 18px; background: var(--card, transparent); overflow: hidden; }
  .sp-panel h2 { margin: 0; padding: 1rem 1.25rem; font-family: inherit; font-size: 1rem; font-weight: 800; border-bottom: 2px solid var(--border, currentColor); }
  .sp-actions a:not(.sp-btn) { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
  .sp-row { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; text-decoration: none; color: inherit; }
  .sp-row + .sp-row { border-top: 1px solid var(--border, currentColor); }
  .sp-row strong { display: block; line-height: 1.3; }
  .sp-row span { font-size: .875rem; opacity: .7; }
  .sp-row em { flex: none; font-style: normal; font-weight: 800; }
  .sp-why { display: grid; gap: 0; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); border-top: 2px solid var(--border, currentColor); border-bottom: 2px solid var(--border, currentColor); }
  .sp-why div { padding: 1.75rem 1.25rem; }
  .sp-why h3 { margin: 0 0 .375rem; font-size: 1.0625rem; font-weight: 800; }
  .sp-why p { margin: 0; opacity: .75; line-height: 1.55; }
  .sp-section { padding: clamp(2.5rem, 6vw, 4.5rem) 0; }
  .sp-h2 { margin: 0 0 1.5rem; font-size: clamp(1.5rem, 3.4vw, 2.25rem); letter-spacing: -.015em; text-wrap: balance; }
  .sp-grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); }
  .sp-card { display: flex; flex-direction: column; gap: .5rem; padding: 1.25rem; border: 2px solid var(--border, currentColor); border-radius: 16px; background: var(--card, transparent); text-decoration: none; color: inherit; }
  .sp-card img { width: 100%; height: 9.5rem; object-fit: cover; border-radius: 10px; }
  .sp-card h3 { margin: 0; font-size: 1.125rem; font-weight: 800; line-height: 1.3; }
  .sp-card p { margin: 0; opacity: .75; line-height: 1.5; font-size: .9375rem; }
  .sp-card small { margin-top: auto; font-size: .875rem; font-weight: 800; }
  .sp-band { background: var(--sb-brand); color: #fff; }
  .sp-band .sp-wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1.25rem; padding-top: 2.5rem; padding-bottom: 2.5rem; }
  .sp-band h2 { margin: 0; font-size: clamp(1.375rem, 3vw, 2rem); text-wrap: balance; }
  .sp-band .sp-btn { background: #fff; color: var(--sb-brand); border-color: #fff; }
</style>
<div class="sp-wrap">
  <section class="sp-hero">
    <div>
      {{#if tenant.location}}<p class="sp-kicker">{{ tenant.location }}</p>{{/if}}
      <h1 class="sp-title">Learn something you will use this month.</h1>
      <p class="sp-lead">{{ tenant.name }} runs practical courses you can take at your own pace, with a certificate when you finish.</p>
      <form class="sp-search" data-lms-form="search" role="search">
        <input name="q" type="search" placeholder="What do you want to learn?" aria-label="Search courses">
        <button class="sp-btn" type="submit">Search</button>
      </form>
      <div class="sp-actions">
        {{#if user.isAuthenticated}}
        <a class="sp-btn sp-btn-quiet" href="{{ auth.dashboardUrl }}">Go to my dashboard</a>
        {{else}}
        <a class="sp-btn sp-btn-quiet" href="{{ auth.registerUrl }}">Create a free account</a>
        <a href="{{ auth.loginUrl }}">Sign in</a>
        {{/if}}
      </div>
    </div>
    <div class="sp-panel">
      <h2>Open for enrolment</h2>
      {{#each courses}}
      <a class="sp-row" href="{{ this.url }}">
        <div><strong>{{ this.title }}</strong><span>{{ this.lessonCount }} lessons</span></div>
        <em>{{ this.price }}</em>
      </a>
      {{/each}}
    </div>
  </section>
</div>
<section class="sp-why">
  <div><h3>Start today</h3><p>Register in a minute and open your first lesson straight away.</p></div>
  <div><h3>Go at your pace</h3><p>Lessons wait for you. Pick up on your phone exactly where you stopped.</p></div>
  <div><h3>Prove it</h3><p>Pass the checks along the way and earn a certificate you can share.</p></div>
</section>
<div class="sp-wrap">
  <section class="sp-section">
    <h2 class="sp-h2">All courses</h2>
    <div class="sp-grid">
      {{#each courses}}
      <a class="sp-card" href="{{ this.url }}">
        {{#if this.thumbnailUrl}}<img src="{{ this.thumbnailUrl }}" alt="" loading="lazy" width="640" height="360">{{/if}}
        <h3>{{ this.title }}</h3>
        <p>{{ this.description }}</p>
        <small>{{ this.price }} · {{ this.lessonCount }} lessons</small>
      </a>
      {{/each}}
    </div>
  </section>
</div>
<section class="sp-band">
  <div class="sp-wrap">
    <h2>Your first lesson is a minute away.</h2>
    <a class="sp-btn" href="{{ auth.registerUrl }}">Register</a>
  </div>
</section>
`;

/** The learner's journey as the spine of the page: four real steps, in order. */
export const HOME_PATHWAY = `<style>
  .pw-wrap { max-width: 66rem; margin: 0 auto; padding: 0 1.25rem; }
  .pw-hero { padding: clamp(3rem, 8vw, 6rem) 0 clamp(2rem, 5vw, 3.5rem); border-left: 8px solid var(--sb-brand); padding-left: clamp(1rem, 4vw, 2.5rem); margin-top: clamp(1.5rem, 4vw, 3rem); }
  .pw-title { margin: 0; font-size: clamp(2rem, 5.5vw, 3.5rem); line-height: 1.08; letter-spacing: -.02em; text-wrap: balance; max-width: 18ch; }
  .pw-lead { margin: 1rem 0 0; max-width: 36rem; font-size: 1.125rem; line-height: 1.6; opacity: .8; }
  .pw-actions { display: flex; flex-wrap: wrap; gap: .75rem; margin-top: 1.75rem; }
  .pw-btn { display: inline-block; padding: .8rem 1.3rem; border: 2px solid var(--sb-brand); border-radius: 999px; background: var(--sb-brand); color: #fff; font-weight: 800; text-decoration: none; }
  .pw-btn-quiet { background: transparent; color: inherit; border-color: var(--border, currentColor); }
  .pw-btn:focus-visible, .pw-item:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 3px; }
  .pw-steps { counter-reset: pw; display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13.5rem), 1fr)); margin: clamp(2rem, 5vw, 3.5rem) 0; padding: 0; list-style: none; }
  .pw-steps li { counter-increment: pw; position: relative; padding: 3.25rem 1.25rem 1.25rem; border: 2px solid var(--border, currentColor); border-radius: 16px; background: var(--card, transparent); }
  .pw-steps li::before { content: counter(pw); position: absolute; top: 1rem; left: 1.25rem; display: flex; align-items: center; justify-content: center; width: 1.75rem; height: 1.75rem; border-radius: 999px; background: var(--sb-brand); color: #fff; font-size: .875rem; font-weight: 800; }
  .pw-steps h3 { margin: 0 0 .375rem; font-size: 1.0625rem; font-weight: 800; }
  .pw-steps p { margin: 0; opacity: .75; line-height: 1.5; font-size: .9375rem; }
  .pw-h2 { margin: clamp(2.5rem, 6vw, 4rem) 0 1.25rem; font-size: clamp(1.5rem, 3.2vw, 2.125rem); letter-spacing: -.015em; }
  .pw-list { display: grid; gap: .75rem; }
  .pw-item { display: grid; gap: .25rem 1.5rem; grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding: 1.125rem 1.25rem; border: 2px solid var(--border, currentColor); border-radius: 14px; background: var(--card, transparent); text-decoration: none; color: inherit; }
  .pw-item strong { font-size: 1.0625rem; line-height: 1.3; }
  .pw-item span { grid-column: 1; opacity: .75; font-size: .9375rem; line-height: 1.5; }
  .pw-item em { grid-row: 1 / span 2; grid-column: 2; font-style: normal; font-weight: 800; text-align: right; }
  .pw-faq { margin-bottom: clamp(2.5rem, 6vw, 4rem); border-top: 2px solid var(--border, currentColor); }
  .pw-faq details { border-bottom: 2px solid var(--border, currentColor); }
  .pw-faq summary { padding: 1rem 0; font-weight: 800; cursor: pointer; }
  .pw-item strong { font-weight: 800; }
  .pw-faq summary:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 2px; }
  .pw-faq p { margin: 0 0 1rem; max-width: 40rem; opacity: .8; line-height: 1.6; }
</style>
<div class="pw-wrap">
  <section class="pw-hero">
    <h1 class="pw-title">From your first lesson to your certificate.</h1>
    <p class="pw-lead">{{ tenant.name }} takes you through it in four steps. You can start the first one now.</p>
    <div class="pw-actions">
      {{#if user.isAuthenticated}}
      <a class="pw-btn" href="{{ auth.dashboardUrl }}">Continue where I left off</a>
      {{else}}
      <a class="pw-btn" href="{{ auth.registerUrl }}">Register</a>
      <a class="pw-btn pw-btn-quiet" href="{{ auth.loginUrl }}">Sign in</a>
      {{/if}}
    </div>
  </section>

  <ol class="pw-steps">
    <li><h3>Create your account</h3><p>Your name, an email address and a password. We confirm the email with a code.</p></li>
    <li><h3>Choose a course</h3><p>Browse the catalogue, read what each course covers, and enrol.</p></li>
    <li><h3>Learn at your pace</h3><p>Short lessons with checks along the way, on any device.</p></li>
    <li><h3>Earn your certificate</h3><p>Finish the course and your certificate is issued automatically.</p></li>
  </ol>

  <section>
    <h2 class="pw-h2">Programmes</h2>
    <div class="pw-list">
      {{#each programmes}}
      <a class="pw-item" href="{{ this.url }}">
        <strong>{{ this.title }}</strong>
        <span>{{ this.description }}</span>
        <em>{{ this.price }}<br>{{ this.courseCount }} courses</em>
      </a>
      {{/each}}
    </div>
  </section>

  <section>
    <h2 class="pw-h2">Courses</h2>
    <div class="pw-list">
      {{#each courses}}
      <a class="pw-item" href="{{ this.url }}">
        <strong>{{ this.title }}</strong>
        <span>{{ this.description }}</span>
        <em>{{ this.price }}<br>{{ this.lessonCount }} lessons</em>
      </a>
      {{/each}}
    </div>
  </section>

  <section>
    <h2 class="pw-h2">Questions people ask first</h2>
    <div class="pw-faq">
      <details><summary>Do I need to pay to register?</summary><p>No. Creating an account is free; you only pay for a course that has a price, when you enrol in it.</p></details>
      <details><summary>Can I study on my phone?</summary><p>Yes. Every lesson works on a phone, and your progress follows you between devices.</p></details>
      <details><summary>How do I get my certificate?</summary><p>Complete every lesson and pass the checks. It appears under Certificates in your dashboard.</p></details>
    </div>
  </section>
</div>
`;

/** A full-width band in the academy's colour, then what there is to study. */
export const HOME_CAMPUS = `<style>
  .cp-hero { background: var(--sb-brand); color: #fff; }
  .cp-hero-in { max-width: 70rem; margin: 0 auto; padding: clamp(3rem, 9vw, 6.5rem) 1.25rem; text-align: center; }
  .cp-logo { height: 4.5rem; width: auto; margin: 0 auto 1.5rem; border-radius: 12px; }
  .cp-title { margin: 0 auto; max-width: 20ch; font-size: clamp(2.25rem, 6.5vw, 4.25rem); line-height: 1.03; letter-spacing: -.03em; text-wrap: balance; }
  .cp-lead { margin: 1.25rem auto 0; max-width: 36rem; font-size: 1.125rem; line-height: 1.6; opacity: .92; }
  .cp-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: .75rem; margin-top: 2rem; }
  .cp-btn { display: inline-block; padding: .85rem 1.4rem; border: 2px solid #fff; border-radius: 12px; background: #fff; color: var(--sb-brand); font-weight: 800; text-decoration: none; }
  .cp-btn-ghost { background: transparent; color: #fff; }
  .cp-btn:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
  .cp-wrap { max-width: 70rem; margin: 0 auto; padding: clamp(2.5rem, 6vw, 4.5rem) 1.25rem; }
  .cp-h2 { margin: 0 0 .5rem; font-size: clamp(1.5rem, 3.4vw, 2.25rem); letter-spacing: -.015em; }
  .cp-sub { margin: 0 0 1.75rem; opacity: .75; max-width: 38rem; line-height: 1.6; }
  .cp-grid { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); }
  .cp-card { display: flex; flex-direction: column; border: 2px solid var(--border, currentColor); border-radius: 18px; background: var(--card, transparent); overflow: hidden; text-decoration: none; color: inherit; }
  .cp-card:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 3px; }
  .cp-card img { width: 100%; height: 10.5rem; object-fit: cover; }
  .cp-card div { display: flex; flex: 1; flex-direction: column; gap: .5rem; padding: 1.25rem; }
  .cp-card h3 { margin: 0; font-size: 1.1875rem; font-weight: 800; line-height: 1.3; }
  .cp-card p { margin: 0; opacity: .75; line-height: 1.5; font-size: .9375rem; }
  .cp-card small { margin-top: auto; padding-top: .5rem; font-size: .875rem; font-weight: 800; color: var(--sb-brand); }
  .cp-quote { border-top: 2px solid var(--border, currentColor); border-bottom: 2px solid var(--border, currentColor); }
  .cp-quote blockquote { margin: 0 auto; max-width: 46rem; font-size: clamp(1.375rem, 3.2vw, 2rem); line-height: 1.35; text-align: center; text-wrap: balance; }
  .cp-quote p { margin: 1.25rem 0 0; text-align: center; font-weight: 700; opacity: .75; }
  .cp-contact { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); }
  .cp-contact h3 { margin: 0 0 .25rem; font-size: 1rem; font-weight: 800; }
  .cp-contact a { text-decoration: underline; text-underline-offset: 4px; }
  .cp-contact p { margin: 0; opacity: .8; line-height: 1.55; }
</style>
<section class="cp-hero">
  <div class="cp-hero-in">
    {{#if tenant.logoUrl}}<img class="cp-logo" src="{{ tenant.logoUrl }}" alt="" width="144" height="72">{{/if}}
    <h1 class="cp-title">{{ tenant.name }}</h1>
    <p class="cp-lead">Courses and programmes for people who want to get good at something, taught by people who do it.</p>
    <div class="cp-actions">
      {{#if user.isAuthenticated}}
      <a class="cp-btn" href="{{ auth.dashboardUrl }}">Go to my dashboard</a>
      {{else}}
      <a class="cp-btn" href="{{ auth.registerUrl }}">Register</a>
      <a class="cp-btn cp-btn-ghost" href="{{ auth.loginUrl }}">Sign in</a>
      {{/if}}
      <a class="cp-btn cp-btn-ghost" href="{{ catalog.coursesUrl }}">Browse courses</a>
    </div>
  </div>
</section>
<section class="cp-wrap">
  <h2 class="cp-h2">What you can study</h2>
  <p class="cp-sub">Every course lists exactly what it covers before you enrol.</p>
  <div class="cp-grid">
    {{#each courses}}
    <a class="cp-card" href="{{ this.url }}">
      {{#if this.thumbnailUrl}}<img src="{{ this.thumbnailUrl }}" alt="" loading="lazy" width="640" height="360">{{/if}}
      <div>
        <h3>{{ this.title }}</h3>
        <p>{{ this.description }}</p>
        <small>{{ this.price }} · {{ this.lessonCount }} lessons</small>
      </div>
    </a>
    {{/each}}
  </div>
</section>
<section class="cp-quote">
  <div class="cp-wrap">
    <blockquote>“Replace this with something one of your learners actually said about studying with you.”</blockquote>
    <p>Their name, and the course they took</p>
  </div>
</section>
<section class="cp-wrap">
  <h2 class="cp-h2">Find us</h2>
  <div class="cp-contact">
    {{#if tenant.address}}<div><h3>Address</h3><p>{{ tenant.address }}</p></div>{{/if}}
    {{#if tenant.email}}<div><h3>Email</h3><p><a href="mailto:{{ tenant.email }}">{{ tenant.email }}</a></p></div>{{/if}}
    {{#if tenant.phone}}<div><h3>Phone</h3><p><a href="tel:{{ tenant.phone }}">{{ tenant.phone }}</a></p></div>{{/if}}
  </div>
</section>
`;

/** Editorial and text-led: a ruled list of what is on, and a welcome back for learners. */
export const HOME_NOTICEBOARD = `<style>
  .nb-wrap { max-width: 58rem; margin: 0 auto; padding: clamp(2.5rem, 7vw, 5rem) 1.25rem; }
  .nb-masthead { padding-bottom: 1.5rem; border-bottom: 4px double var(--border, currentColor); }
  .nb-name { margin: 0; font-family: ${SERIF}; font-size: clamp(2.25rem, 7vw, 4.5rem); line-height: 1; letter-spacing: -.02em; }
  .nb-meta { margin: .75rem 0 0; font-size: .9375rem; opacity: .75; }
  .nb-intro { display: grid; gap: 2rem; margin: 2.5rem 0; }
  @media (min-width: 48rem) { .nb-intro { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); } }
  .nb-intro p { margin: 0; font-family: ${SERIF}; font-size: clamp(1.25rem, 2.6vw, 1.5rem); line-height: 1.45; text-wrap: pretty; }
  .nb-box { padding: 1.25rem; border: 2px solid var(--border, currentColor); background: var(--card, transparent); }
  .nb-box h2 { margin: 0 0 .5rem; font-family: inherit; font-size: 1.0625rem; font-weight: 800; }
  .nb-box p { font-family: inherit; font-size: .9375rem; line-height: 1.55; opacity: .8; }
  .nb-box ul { margin: .75rem 0 0; padding: 0; list-style: none; }
  .nb-box li { padding: .5rem 0; border-top: 1px solid var(--border, currentColor); font-size: .9375rem; }
  .nb-link { font-weight: 800; color: var(--sb-brand); text-decoration: underline; text-underline-offset: 4px; }
  .nb-link:focus-visible, .nb-row a:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 2px; }
  .nb-actions { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; margin-top: 1rem; }
  .nb-h2 { margin: 3rem 0 0; padding-bottom: .625rem; font-family: ${SERIF}; font-size: clamp(1.5rem, 3.4vw, 2rem); border-bottom: 2px solid var(--border, currentColor); }
  .nb-row { display: grid; gap: .25rem 1.5rem; grid-template-columns: minmax(0, 1fr) auto; padding: 1.125rem 0; border-bottom: 1px solid var(--border, currentColor); }
  .nb-row h3 { margin: 0; font-size: 1.125rem; font-weight: 800; line-height: 1.3; }
  .nb-row h3 a { color: inherit; text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
  .nb-row p { grid-column: 1; margin: 0; opacity: .75; line-height: 1.55; }
  .nb-row div { grid-row: 1 / span 2; grid-column: 2; text-align: right; font-size: .9375rem; }
  .nb-row div strong { display: block; }
  .nb-foot { margin-top: 3rem; font-size: .9375rem; line-height: 1.7; opacity: .8; }
  .nb-foot a { text-decoration: underline; text-underline-offset: 3px; }
</style>
<div class="nb-wrap">
  <header class="nb-masthead">
    <h1 class="nb-name">{{ tenant.name }}</h1>
    <p class="nb-meta">{{#if tenant.location}}{{ tenant.location }} · {{/if}}Courses open for enrolment</p>
  </header>

  <section class="nb-intro">
    <p>We teach practical courses in plain language. Read what each one covers, enrol in the ones you want, and study whenever you have the time.</p>
    <div class="nb-box">
      {{#if user.isAuthenticated}}
      <h2>Welcome back, {{ user.name }}</h2>
      <p>You are enrolled in {{ progress.enrollmentCount }} courses and have finished {{ progress.completedCount }}.</p>
      <ul>
        {{#each progress.enrollments}}
        <li><a class="nb-link" href="{{ this.url }}">{{ this.courseTitle }}</a> — {{ this.percent }}% done</li>
        {{/each}}
      </ul>
      {{else}}
      <h2>New here?</h2>
      <p>An account is free and takes a minute. You will need it to enrol and to keep your place.</p>
      <div class="nb-actions">
        <a class="nb-link" href="{{ auth.registerUrl }}">Create an account</a>
        <a class="nb-link" href="{{ auth.loginUrl }}">Sign in</a>
      </div>
      {{/if}}
    </div>
  </section>

  <section>
    <h2 class="nb-h2">Courses</h2>
    {{#each courses}}
    <article class="nb-row">
      <h3><a href="{{ this.url }}">{{ this.title }}</a></h3>
      <p>{{ this.description }}</p>
      <div><strong>{{ this.price }}</strong>{{ this.lessonCount }} lessons</div>
    </article>
    {{/each}}
  </section>

  <section>
    <h2 class="nb-h2">Programmes</h2>
    {{#each programmes}}
    <article class="nb-row">
      <h3><a href="{{ this.url }}">{{ this.title }}</a></h3>
      <p>{{ this.description }}</p>
      <div><strong>{{ this.price }}</strong>{{ this.courseCount }} courses</div>
    </article>
    {{/each}}
  </section>

  <footer class="nb-foot">
    {{#if tenant.address}}{{ tenant.address }}<br>{{/if}}
    {{#if tenant.email}}<a href="mailto:{{ tenant.email }}">{{ tenant.email }}</a>{{/if}}
    {{#if tenant.phone}} · <a href="tel:{{ tenant.phone }}">{{ tenant.phone }}</a>{{/if}}
  </footer>
</div>
`;

/* -------------------------------------------------------------------------- */
/* Ordinary pages                                                              */
/* -------------------------------------------------------------------------- */

export const ABOUT_PAGE = `<style>
  .ab-wrap { max-width: 62rem; margin: 0 auto; padding: clamp(2.5rem, 7vw, 5rem) 1.25rem; }
  .ab-label { margin: 0 0 1rem; font-weight: 700; color: var(--sb-brand); }
  .ab-statement { margin: 0; font-family: ${SERIF}; font-size: clamp(1.75rem, 5vw, 3.25rem); line-height: 1.15; letter-spacing: -.015em; text-wrap: balance; }
  .ab-cols { display: grid; gap: 1.5rem 3rem; margin: clamp(2rem, 5vw, 3.5rem) 0; }
  @media (min-width: 46rem) { .ab-cols { grid-template-columns: 1fr 1fr; } }
  .ab-cols p { margin: 0; font-size: 1.0625rem; line-height: 1.7; opacity: .85; }
  .ab-values { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border-top: 2px solid var(--border, currentColor); }
  .ab-values li { display: grid; gap: .25rem 2rem; padding: 1.5rem 0; border-bottom: 2px solid var(--border, currentColor); }
  @media (min-width: 46rem) { .ab-values li { grid-template-columns: 14rem minmax(0, 1fr); } }
  .ab-values h3 { margin: 0; font-size: 1.1875rem; font-weight: 800; }
  .ab-values p { margin: 0; line-height: 1.6; opacity: .8; }
  .ab-end { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; margin-top: clamp(2rem, 5vw, 3.5rem); padding: 1.5rem; border: 2px solid var(--border, currentColor); border-radius: 16px; background: var(--card, transparent); }
  .ab-end p { margin: 0; font-weight: 700; }
  .ab-btn { display: inline-block; padding: .8rem 1.25rem; border: 2px solid var(--sb-brand); border-radius: 12px; background: var(--sb-brand); color: #fff; font-weight: 800; text-decoration: none; }
  .ab-btn:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 3px; }
</style>
<div class="ab-wrap">
  <header>
    <p class="ab-label">About {{ tenant.name }}</p>
    <h1 class="ab-statement">We teach the way we would want to be taught: clearly, practically, and without wasting your time.</h1>
  </header>
  <div class="ab-cols">
    <p>Say here how {{ tenant.name }} began, who it is for, and what a learner can expect from the first week. Two or three honest sentences do more than a page of adjectives.</p>
    <p>Then say what makes your teaching different — the people, the method, the results your learners have had. Name real things: a course, a certificate, a place.</p>
  </div>
  <ul class="ab-values">
    <li><h3>Practical first</h3><p>Every lesson ends with something you can do, not just something you have read.</p></li>
    <li><h3>Plain language</h3><p>We explain a term the first time we use it, and we do not hide behind jargon.</p></li>
    <li><h3>Proof of work</h3><p>Checks along the way and a certificate at the end, earned rather than handed out.</p></li>
  </ul>
  <div class="ab-end">
    <p>See what you could be studying next week.</p>
    <a class="ab-btn" href="{{ catalog.coursesUrl }}">Browse courses</a>
  </div>
</div>
`;

export const CONTACT_PAGE = `<style>
  .ct-wrap { max-width: 60rem; margin: 0 auto; padding: clamp(2.5rem, 7vw, 5rem) 1.25rem; }
  .ct-title { margin: 0; font-size: clamp(2.25rem, 6.5vw, 4rem); line-height: 1.04; letter-spacing: -.025em; }
  .ct-lead { margin: 1rem 0 0; max-width: 34rem; font-size: 1.125rem; line-height: 1.6; opacity: .8; }
  .ct-ways { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); margin: clamp(2rem, 5vw, 3rem) 0; }
  .ct-way { padding: 1.5rem; border: 2px solid var(--border, currentColor); border-radius: 18px; background: var(--card, transparent); }
  .ct-way h2 { margin: 0 0 .5rem; font-family: inherit; font-size: 1rem; font-weight: 700; opacity: .7; }
  .ct-way p { margin: 0; font-size: 1.1875rem; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
  .ct-way a { color: inherit; text-decoration: underline; text-decoration-color: var(--sb-brand); text-decoration-thickness: 3px; text-underline-offset: 5px; }
  .ct-way a:focus-visible, .ct-next a:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 3px; }
  .ct-next { padding-top: 1.5rem; border-top: 2px solid var(--border, currentColor); }
  .ct-next h2 { margin: 0 0 .75rem; font-family: inherit; font-size: 1.25rem; font-weight: 800; }
  .ct-next ul { margin: 0; padding-left: 1.25rem; list-style: disc; line-height: 1.9; }
  .ct-next a { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
</style>
<div class="ct-wrap">
  <header>
    <h1 class="ct-title">Talk to us.</h1>
    <p class="ct-lead">Questions about a course, your account or a payment — a person at {{ tenant.name }} will answer.</p>
  </header>
  <div class="ct-ways">
    {{#if tenant.email}}<div class="ct-way"><h2>Email</h2><p><a href="mailto:{{ tenant.email }}">{{ tenant.email }}</a></p></div>{{/if}}
    {{#if tenant.phone}}<div class="ct-way"><h2>Phone</h2><p><a href="tel:{{ tenant.phone }}">{{ tenant.phone }}</a></p></div>{{/if}}
    {{#if tenant.address}}<div class="ct-way"><h2>Visit</h2><p>{{ tenant.address }}</p></div>{{/if}}
  </div>
  <div class="ct-next">
    <h2>It may be quicker to</h2>
    <ul>
      <li><a href="{{ auth.forgotPasswordUrl }}">Reset your password</a> if you cannot sign in</li>
      <li><a href="{{ catalog.coursesUrl }}">Read what each course covers</a> before asking which to take</li>
      <li><a href="{{ auth.loginUrl }}">Sign in</a> to see your progress and certificates</li>
    </ul>
  </div>
</div>
`;

export const FAQ_PAGE = `<style>
  .fq-wrap { max-width: 50rem; margin: 0 auto; padding: clamp(2.5rem, 7vw, 5rem) 1.25rem; }
  .fq-title { margin: 0; font-size: clamp(2rem, 5.5vw, 3.25rem); line-height: 1.08; letter-spacing: -.02em; text-wrap: balance; }
  .fq-lead { margin: 1rem 0 0; font-size: 1.0625rem; line-height: 1.6; opacity: .8; }
  .fq-group { margin: clamp(2rem, 5vw, 3rem) 0 .75rem; font-family: inherit; font-size: 1rem; font-weight: 800; color: var(--sb-brand); }
  .fq-item { border: 2px solid var(--border, currentColor); border-radius: 14px; background: var(--card, transparent); }
  .fq-item + .fq-item { margin-top: .625rem; }
  .fq-item summary { display: flex; justify-content: space-between; gap: 1rem; padding: 1rem 1.25rem; font-weight: 800; line-height: 1.35; cursor: pointer; list-style: none; border-radius: 12px; }
  .fq-item summary::after { content: "+"; flex: none; font-weight: 400; opacity: .6; }
  .fq-item[open] summary::after { content: "−"; }
  .fq-item summary:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 2px; }
  .fq-item p { margin: 0; padding: 0 1.25rem 1.125rem; line-height: 1.65; opacity: .85; }
  .fq-end { margin-top: clamp(2rem, 5vw, 3rem); padding-top: 1.5rem; border-top: 2px solid var(--border, currentColor); line-height: 1.7; }
  .fq-end a { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
</style>
<div class="fq-wrap">
  <header>
    <h1 class="fq-title">Questions, answered.</h1>
    <p class="fq-lead">The things people ask {{ tenant.name }} most often. Replace these with your own.</p>
  </header>

  <section>
    <h2 class="fq-group">Getting started</h2>
    <details class="fq-item"><summary>How do I create an account?</summary><p>Choose Register, enter your name, email and a password, and confirm your email with the code we send you.</p></details>
    <details class="fq-item"><summary>Is registering free?</summary><p>Yes. You only pay when you enrol in a course that has a price.</p></details>
    <details class="fq-item"><summary>I forgot my password. What now?</summary><p>Use the forgot-password link on the sign-in page and we will email you a link to choose a new one.</p></details>
  </section>

  <section>
    <h2 class="fq-group">Studying</h2>
    <details class="fq-item"><summary>Can I study on my phone?</summary><p>Yes. Lessons, quizzes and your progress all work on a phone.</p></details>
    <details class="fq-item"><summary>Is there a deadline?</summary><p>Unless a course says otherwise, you can study at your own pace.</p></details>
    <details class="fq-item"><summary>What happens if I fail a quiz?</summary><p>You can try again. The result shows which questions to review and where they are taught.</p></details>
  </section>

  <section>
    <h2 class="fq-group">Certificates and payment</h2>
    <details class="fq-item"><summary>How do I get my certificate?</summary><p>Complete every lesson in the course. Your certificate then appears in your dashboard.</p></details>
    <details class="fq-item"><summary>How do I pay for a course?</summary><p>Enrol in the course and follow the payment step. Your enrolment is confirmed as soon as the payment is.</p></details>
  </section>

  <p class="fq-end">Still stuck? {{#if tenant.email}}Write to <a href="mailto:{{ tenant.email }}">{{ tenant.email }}</a>.{{else}}Get in touch with us.{{/if}}</p>
</div>
`;

export const PROGRAMMES_OVERVIEW = `<style>
  .po-wrap { max-width: 70rem; margin: 0 auto; padding: clamp(2.5rem, 7vw, 5rem) 1.25rem; }
  .po-title { margin: 0; font-size: clamp(2rem, 5.5vw, 3.5rem); line-height: 1.06; letter-spacing: -.02em; text-wrap: balance; max-width: 20ch; }
  .po-lead { margin: 1rem 0 0; max-width: 38rem; font-size: 1.125rem; line-height: 1.6; opacity: .8; }
  .po-plans { display: grid; gap: 1.25rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); margin: clamp(2rem, 5vw, 3rem) 0; }
  .po-plan { display: flex; flex-direction: column; padding: 1.5rem; border: 2px solid var(--border, currentColor); border-radius: 20px; background: var(--card, transparent); }
  .po-plan h2 { margin: 0; font-size: 1.25rem; line-height: 1.3; }
  .po-price { margin: .75rem 0 0; font-size: clamp(1.75rem, 4vw, 2.25rem); font-weight: 800; letter-spacing: -.02em; }
  .po-plan p { margin: .75rem 0 0; line-height: 1.55; opacity: .8; }
  .po-count { font-weight: 700; opacity: 1; }
  .po-btn { display: block; margin-top: 1.5rem; padding: .8rem 1rem; border: 2px solid var(--sb-brand); border-radius: 12px; background: var(--sb-brand); color: #fff; font-weight: 800; text-align: center; text-decoration: none; }
  .po-plan .po-btn { margin-top: auto; }
  .po-plan .po-spacer { flex: 1; min-height: 1.5rem; }
  .po-btn:focus-visible, .po-table a:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 3px; }
  .po-h2 { margin: 0 0 .5rem; font-size: clamp(1.375rem, 3vw, 1.875rem); }
  .po-note { margin: 0 0 1.25rem; opacity: .75; }
  .po-table { border-top: 2px solid var(--border, currentColor); }
  .po-line { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .25rem 1.5rem; padding: 1rem 0; border-bottom: 1px solid var(--border, currentColor); }
  .po-line a { font-weight: 700; color: inherit; text-decoration: underline; text-underline-offset: 4px; }
  .po-line span { font-weight: 800; font-variant-numeric: tabular-nums; }
</style>
<div class="po-wrap">
  <header>
    <h1 class="po-title">Programmes and what they cost.</h1>
    <p class="po-lead">A programme is a set of courses taken together. Each one below shows its price and how many courses it includes.</p>
  </header>
  <div class="po-plans">
    {{#each programmes}}
    <article class="po-plan">
      <h2>{{ this.title }}</h2>
      <p class="po-price">{{ this.price }}</p>
      <p class="po-count">{{ this.courseCount }} courses included</p>
      <p>{{ this.description }}</p>
      <div class="po-spacer"></div>
      <a class="po-btn" href="{{ this.url }}">See the programme</a>
    </article>
    {{/each}}
  </div>
  <section>
    <h2 class="po-h2">Single courses</h2>
    <p class="po-note">Prefer one course at a time? Every course can be taken on its own.</p>
    <div class="po-table">
      {{#each courses}}
      <div class="po-line"><a href="{{ this.url }}">{{ this.title }}</a><span>{{ this.price }}</span></div>
      {{/each}}
    </div>
  </section>
</div>
`;

/* -------------------------------------------------------------------------- */
/* Catalogue, course and programme pages                                       */
/* -------------------------------------------------------------------------- */

export const CATALOGUE_LIST = `<style>
  .cl-wrap { max-width: 64rem; margin: 0 auto; padding: clamp(2rem, 6vw, 4rem) 1.25rem; }
  .cl-head { display: grid; gap: 1.25rem; align-items: end; padding-bottom: 1.5rem; border-bottom: 2px solid var(--border, currentColor); }
  @media (min-width: 48rem) { .cl-head { grid-template-columns: minmax(0, 1fr) minmax(0, 22rem); } }
  .cl-title { margin: 0; font-size: clamp(2rem, 5.5vw, 3.25rem); line-height: 1.05; letter-spacing: -.02em; }
  .cl-sub { margin: .5rem 0 0; opacity: .75; line-height: 1.55; }
  .cl-search { display: flex; gap: .5rem; }
  .cl-search input { flex: 1; min-width: 0; padding: .75rem .9rem; border: 2px solid var(--border, currentColor); border-radius: 12px; background: var(--card, transparent); color: inherit; font: inherit; }
  .cl-search input:focus-visible, .cl-btn:focus-visible, .cl-item:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 3px; }
  .cl-btn { padding: .75rem 1.1rem; border: 2px solid var(--sb-brand); border-radius: 12px; background: var(--sb-brand); color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
  .cl-found { margin: 1.25rem 0 0; font-weight: 700; }
  .cl-found a { text-decoration: underline; text-underline-offset: 4px; }
  .cl-item { display: grid; gap: .5rem 1.25rem; grid-template-columns: minmax(0, 1fr) auto; align-items: center; padding: 1.25rem 0; border-bottom: 1px solid var(--border, currentColor); text-decoration: none; color: inherit; }
  .cl-item h2 { margin: 0; font-family: inherit; font-size: 1.1875rem; font-weight: 800; line-height: 1.3; }
  .cl-item p { margin: .25rem 0 0; opacity: .75; line-height: 1.5; }
  .cl-meta { text-align: right; font-size: .9375rem; white-space: nowrap; }
  .cl-meta strong { display: block; font-size: 1.0625rem; }
  .cl-more { margin-top: 2rem; }
  .cl-more a { font-weight: 800; text-decoration: underline; text-underline-offset: 4px; }
</style>
<div class="cl-wrap">
  <header class="cl-head">
    <div>
      <h1 class="cl-title">Courses</h1>
      <p class="cl-sub">Everything open for enrolment at {{ tenant.name }}.</p>
    </div>
    <form class="cl-search" data-lms-form="search" role="search">
      <input name="q" type="search" placeholder="Search courses…" aria-label="Search courses">
      <button class="cl-btn" type="submit">Search</button>
    </form>
  </header>
  <section aria-label="Courses">
    {{#if catalog.query}}<p class="cl-found">{{ catalog.count }} found for “{{ catalog.query }}” — <a href="{{ catalog.coursesUrl }}">show all courses</a></p>{{/if}}
    {{#each courses}}
    <a class="cl-item" href="{{ this.url }}">
      <div>
        <h2>{{ this.title }}</h2>
        <p>{{ this.description }}</p>
      </div>
      <div class="cl-meta"><strong>{{ this.price }}</strong>{{ this.lessonCount }} lessons</div>
    </a>
    {{/each}}
  </section>
  <p class="cl-more">Looking for a full pathway? <a href="{{ catalog.programmesUrl }}">See our programmes</a></p>
</div>
`;

export const COURSE_OUTLINE = `<style>
  .co-wrap { max-width: 70rem; margin: 0 auto; padding: clamp(2rem, 6vw, 4rem) 1.25rem; }
  .co-back { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
  .co-top { display: grid; gap: 2rem; margin-top: 1.25rem; align-items: start; }
  @media (min-width: 56rem) { .co-top { grid-template-columns: minmax(0, 1fr) 21rem; } }
  .co-title { margin: 0; font-size: clamp(2rem, 5.5vw, 3.25rem); line-height: 1.06; letter-spacing: -.02em; text-wrap: balance; }
  .co-lead { margin: 1rem 0 0; font-size: 1.125rem; line-height: 1.65; opacity: .85; }
  .co-cover { width: 100%; height: auto; max-height: 20rem; object-fit: cover; margin-top: 1.5rem; border-radius: 16px; }
  .co-join { padding: 1.5rem; border: 2px solid var(--border, currentColor); border-radius: 20px; background: var(--card, transparent); }
  .co-price { margin: 0; font-size: 2.25rem; font-weight: 800; letter-spacing: -.02em; line-height: 1.1; }
  .co-count { margin: .375rem 0 1.25rem; opacity: .75; }
  .co-btn { display: block; padding: .9rem 1rem; border: 2px solid var(--sb-brand); border-radius: 12px; background: var(--sb-brand); color: #fff; font-weight: 800; text-align: center; text-decoration: none; }
  .co-btn:focus-visible, .co-back:focus-visible, .co-alt a:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 3px; }
  .co-alt { margin: .875rem 0 0; text-align: center; font-size: .9375rem; }
  .co-alt a { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
  .co-h2 { margin: clamp(2.5rem, 6vw, 3.5rem) 0 1rem; font-size: clamp(1.375rem, 3vw, 1.875rem); }
  .co-outline { margin: 0; padding: 0; list-style: none; counter-reset: co; border: 2px solid var(--border, currentColor); border-radius: 16px; overflow: hidden; }
  .co-outline li { counter-increment: co; display: grid; gap: .125rem 1rem; grid-template-columns: 2rem minmax(0, 1fr) auto; align-items: baseline; padding: .9rem 1.25rem; }
  .co-outline li + li { border-top: 1px solid var(--border, currentColor); }
  .co-outline li::before { content: counter(co); font-weight: 800; opacity: .5; font-variant-numeric: tabular-nums; }
  .co-outline strong { font-weight: 700; line-height: 1.35; }
  .co-outline span { font-size: .875rem; opacity: .7; white-space: nowrap; }
  .co-outline small { grid-column: 2 / span 2; font-size: .8125rem; opacity: .6; }
</style>
<div class="co-wrap">
  <a class="co-back" href="{{ catalog.coursesUrl }}">All courses</a>
  <div class="co-top">
    <div>
      <h1 class="co-title">{{ course.title }}</h1>
      <p class="co-lead">{{ course.description }}</p>
      {{#if course.thumbnailUrl}}<img class="co-cover" src="{{ course.thumbnailUrl }}" alt="" width="960" height="540">{{/if}}
    </div>
    <aside class="co-join">
      <p class="co-price">{{ course.price }}</p>
      <p class="co-count">{{ course.lessonCount }} lessons, at your own pace</p>
      {{#if user.isAuthenticated}}
      <a class="co-btn" href="{{ course.url }}">Go to this course</a>
      {{else}}
      <a class="co-btn" href="{{ course.joinUrl }}">Register to enrol</a>
      <p class="co-alt">Already have an account? <a href="{{ course.signInUrl }}">Sign in</a></p>
      {{/if}}
    </aside>
  </div>
  <section>
    <h2 class="co-h2">What you will cover</h2>
    <ol class="co-outline">
      {{#each course.lessons}}
      <li><strong>{{ this.title }}</strong><span>{{ this.kind }}{{#if this.duration}} · {{ this.duration }}{{/if}}</span>{{#if this.module}}<small>{{ this.module }}</small>{{/if}}</li>
      {{/each}}
    </ol>
  </section>
</div>
`;

export const PROGRAMME_PATHWAY = `<style>
  .pp-hero { background: var(--sb-brand); color: #fff; }
  .pp-hero-in { max-width: 62rem; margin: 0 auto; padding: clamp(2.5rem, 7vw, 5rem) 1.25rem; }
  .pp-kicker { margin: 0 0 .75rem; font-weight: 700; opacity: .9; }
  .pp-title { margin: 0; font-size: clamp(2rem, 5.5vw, 3.5rem); line-height: 1.05; letter-spacing: -.02em; text-wrap: balance; }
  .pp-lead { margin: 1rem 0 0; max-width: 40rem; font-size: 1.125rem; line-height: 1.6; opacity: .92; }
  .pp-facts { display: flex; flex-wrap: wrap; gap: .5rem 2rem; margin: 1.5rem 0 0; font-weight: 800; font-size: 1.125rem; }
  .pp-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 1.25rem; margin-top: 1.75rem; }
  .pp-btn { display: inline-block; padding: .85rem 1.4rem; border: 2px solid #fff; border-radius: 12px; background: #fff; color: var(--sb-brand); font-weight: 800; text-decoration: none; }
  .pp-btn:focus-visible, .pp-actions a:focus-visible { outline: 3px solid #fff; outline-offset: 3px; }
  .pp-actions a:not(.pp-btn) { color: #fff; font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
  .pp-wrap { max-width: 62rem; margin: 0 auto; padding: clamp(2.5rem, 6vw, 4rem) 1.25rem; }
  .pp-h2 { margin: 0 0 1.5rem; font-size: clamp(1.375rem, 3vw, 1.875rem); }
  .pp-path { margin: 0; padding: 0; list-style: none; counter-reset: pp; }
  .pp-path li { counter-increment: pp; position: relative; padding: 0 0 1.75rem 3.25rem; }
  .pp-path li::before { content: counter(pp); position: absolute; left: 0; top: 0; display: flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border: 2px solid var(--sb-brand); border-radius: 999px; background: var(--card, transparent); font-weight: 800; }
  .pp-path li::after { content: ""; position: absolute; left: 1.0625rem; top: 2.25rem; bottom: 0; border-left: 2px solid var(--border, currentColor); }
  .pp-path li:last-child::after { display: none; }
  .pp-path h3 { margin: 0; padding-top: .25rem; font-size: 1.1875rem; font-weight: 800; line-height: 1.3; }
  .pp-path p { margin: .375rem 0 0; line-height: 1.6; opacity: .8; }
  .pp-path small { display: block; margin-top: .375rem; font-size: .875rem; font-weight: 700; opacity: .7; }
</style>
<section class="pp-hero">
  <div class="pp-hero-in">
    <p class="pp-kicker">Programme at {{ tenant.name }}</p>
    <h1 class="pp-title">{{ programme.title }}</h1>
    <p class="pp-lead">{{ programme.description }}</p>
    <p class="pp-facts"><span>{{ programme.price }}</span><span>{{ programme.courseCount }} courses</span></p>
    <div class="pp-actions">
      {{#if user.isAuthenticated}}
      <a class="pp-btn" href="{{ auth.dashboardUrl }}">Go to my dashboard</a>
      {{else}}
      <a class="pp-btn" href="{{ programme.joinUrl }}">Register to enrol</a>
      <a href="{{ programme.signInUrl }}">I already have an account</a>
      {{/if}}
    </div>
  </div>
</section>
<section class="pp-wrap">
  <h2 class="pp-h2">The courses, in order</h2>
  <ol class="pp-path">
    {{#each programme.courses}}
    <li>
      <h3>{{ this.title }}</h3>
      <p>{{ this.description }}</p>
      <small>{{ this.lessonCount }} lessons</small>
    </li>
    {{/each}}
  </ol>
</section>
`;

/* -------------------------------------------------------------------------- */
/* Sign in, register, forgot password                                          */
/* -------------------------------------------------------------------------- */

/**
 * Form styling shared by the five account designs. The forms themselves are
 * declarations the platform runs (see lib/site/site-api.ts): the design owns
 * how they look and nothing about where they go.
 */
const AUTH_FORM_CSS = `
  .au-form { display: grid; gap: .875rem; margin-top: 1.5rem; }
  .au-form label { display: block; margin-bottom: .375rem; font-size: .875rem; font-weight: 700; }
  .au-form input { width: 100%; padding: .8rem .9rem; border: 2px solid var(--border, currentColor); border-radius: 12px; background: var(--card, transparent); color: inherit; font: inherit; }
  .au-form input:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 2px; }
  .au-two { display: grid; gap: .875rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); }
  .au-hint { margin: .375rem 0 0; font-size: .8125rem; opacity: .7; }
  .au-btn { width: 100%; margin-top: .375rem; padding: .9rem 1rem; border: 2px solid var(--sb-brand); border-radius: 12px; background: var(--sb-brand); color: #fff; font: inherit; font-weight: 800; cursor: pointer; }
  .au-btn:focus-visible { outline: 3px solid currentColor; outline-offset: 3px; }
  .au-btn[disabled] { opacity: .6; cursor: progress; }
  .au-links { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem 1.25rem; margin-top: 1.25rem; font-size: .9375rem; }
  .au-links a { font-weight: 700; text-decoration: underline; text-underline-offset: 4px; }
  .au-links a:focus-visible { outline: 3px solid var(--sb-brand); outline-offset: 2px; }
  [data-lms-error] { margin: 0; padding: .7rem .85rem; border: 2px solid #b42318; border-radius: 12px; color: #b42318; font-size: .9375rem; font-weight: 700; }
  [data-lms-success] { margin: 0; padding: .7rem .85rem; border: 2px solid var(--sb-brand); border-radius: 12px; font-size: .9375rem; font-weight: 700; }`;

const LOGIN_FORM = `<form class="au-form" data-lms-form="login">
      <div>
        <label for="login-email">Email</label>
        <input id="login-email" name="email" type="email" autocomplete="email" inputmode="email" required>
      </div>
      <div>
        <label for="login-password">Password</label>
        <input id="login-password" name="password" type="password" autocomplete="current-password" required>
      </div>
      <p data-lms-error></p>
      <button class="au-btn" type="submit">Sign in</button>
    </form>`;

const REGISTER_FORM = `<form class="au-form" data-lms-form="register">
      <div class="au-two">
        <div>
          <label for="reg-first">First name</label>
          <input id="reg-first" name="firstName" type="text" autocomplete="given-name" required>
        </div>
        <div>
          <label for="reg-last">Last name</label>
          <input id="reg-last" name="lastName" type="text" autocomplete="family-name" required>
        </div>
      </div>
      <div>
        <label for="reg-email">Email</label>
        <input id="reg-email" name="email" type="email" autocomplete="email" inputmode="email" required>
      </div>
      <div>
        <label for="reg-password">Password</label>
        <input id="reg-password" name="password" type="password" autocomplete="new-password" minlength="12" required>
        <p class="au-hint">At least 12 characters.</p>
      </div>
      <div>
        <label for="reg-phone">Phone (optional)</label>
        <input id="reg-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel">
      </div>
      <div>
        <label for="reg-referral">Referral code (optional)</label>
        <input id="reg-referral" name="referralCode" type="text" autocomplete="off">
      </div>
      <p data-lms-error></p>
      <button class="au-btn" type="submit">Create account</button>
    </form>`;

/** One quiet card in the middle of the page. */
export const LOGIN_CARD = `<style>
  .lc-page { display: flex; justify-content: center; padding: clamp(2rem, 8vw, 5rem) 1.25rem; }
  .lc-card { width: 100%; max-width: 26rem; padding: clamp(1.5rem, 5vw, 2.25rem); border: 2px solid var(--border, currentColor); border-radius: 22px; background: var(--card, transparent); }
  .lc-logo { height: 2.75rem; width: auto; margin-bottom: 1.25rem; border-radius: 8px; }
  .lc-title { margin: 0; font-size: 1.875rem; line-height: 1.15; letter-spacing: -.015em; }
  .lc-sub { margin: .5rem 0 0; opacity: .75; line-height: 1.55; }
${AUTH_FORM_CSS}
</style>
<div class="lc-page">
  <section class="lc-card">
    {{#if tenant.logoUrl}}<img class="lc-logo" src="{{ tenant.logoUrl }}" alt="" width="88" height="44">{{/if}}
    <h1 class="lc-title">Sign in</h1>
    <p class="lc-sub">Welcome back to {{ tenant.name }}.</p>
    ${LOGIN_FORM}
    <div class="au-links">
      <a href="{{ auth.forgotPasswordUrl }}">Forgot your password?</a>
      <a href="{{ auth.registerUrl }}">Create an account</a>
    </div>
  </section>
</div>
`;

/** The academy's colour on one side, the form on the other. */
export const LOGIN_SPLIT = `<style>
  .ls-page { display: grid; min-height: 34rem; }
  @media (min-width: 54rem) { .ls-page { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  .ls-side { display: flex; flex-direction: column; justify-content: center; padding: clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 3.5rem); background: var(--sb-brand); color: #fff; }
  .ls-side h2 { margin: 0; font-size: clamp(1.75rem, 4.5vw, 2.75rem); line-height: 1.08; letter-spacing: -.02em; text-wrap: balance; }
  .ls-side p { margin: 1rem 0 0; max-width: 28rem; font-size: 1.0625rem; line-height: 1.6; opacity: .92; }
  .ls-main { display: flex; flex-direction: column; justify-content: center; padding: clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 3.5rem); }
  .ls-inner { width: 100%; max-width: 24rem; }
  .ls-title { margin: 0; font-size: 1.875rem; line-height: 1.15; letter-spacing: -.015em; }
  .ls-sub { margin: .5rem 0 0; opacity: .75; }
${AUTH_FORM_CSS}
</style>
<div class="ls-page">
  <aside class="ls-side">
    <h2>Pick up where you left off.</h2>
    <p>Your lessons, your progress and your certificates at {{ tenant.name }} are waiting on the other side.</p>
  </aside>
  <section class="ls-main">
    <div class="ls-inner">
      <h1 class="ls-title">Sign in</h1>
      <p class="ls-sub">Use the email you registered with.</p>
    ${LOGIN_FORM}
      <div class="au-links">
        <a href="{{ auth.forgotPasswordUrl }}">Forgot your password?</a>
        <a href="{{ auth.registerUrl }}">Create an account</a>
      </div>
    </div>
  </section>
</div>
`;

export const REGISTER_CARD = `<style>
  .rc-page { display: flex; justify-content: center; padding: clamp(2rem, 7vw, 4.5rem) 1.25rem; }
  .rc-card { width: 100%; max-width: 32rem; padding: clamp(1.5rem, 5vw, 2.25rem); border: 2px solid var(--border, currentColor); border-radius: 22px; background: var(--card, transparent); }
  .rc-logo { height: 2.75rem; width: auto; margin-bottom: 1.25rem; border-radius: 8px; }
  .rc-title { margin: 0; font-size: 1.875rem; line-height: 1.15; letter-spacing: -.015em; }
  .rc-sub { margin: .5rem 0 0; opacity: .75; line-height: 1.55; }
${AUTH_FORM_CSS}
</style>
<div class="rc-page">
  <section class="rc-card">
    {{#if tenant.logoUrl}}<img class="rc-logo" src="{{ tenant.logoUrl }}" alt="" width="88" height="44">{{/if}}
    <h1 class="rc-title">Create your account</h1>
    <p class="rc-sub">Join {{ tenant.name }}. We will email you a code to confirm your address.</p>
    ${REGISTER_FORM}
    <div class="au-links">
      <span>Already have an account?</span>
      <a href="{{ auth.loginUrl }}">Sign in</a>
    </div>
  </section>
</div>
`;

export const REGISTER_SPLIT = `<style>
  .rs-page { display: grid; }
  @media (min-width: 58rem) { .rs-page { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); } }
  .rs-side { padding: clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 3.5rem); background: var(--sb-brand); color: #fff; }
  .rs-side h2 { margin: 0; font-size: clamp(1.75rem, 4.5vw, 2.75rem); line-height: 1.08; letter-spacing: -.02em; text-wrap: balance; }
  .rs-side ul { margin: 1.75rem 0 0; padding: 0; list-style: none; }
  .rs-side li { padding: 1rem 0; border-top: 1px solid currentColor; line-height: 1.5; }
  .rs-side li strong { display: block; font-size: 1.0625rem; font-weight: 800; }
  .rs-side li span { opacity: .9; font-size: .9375rem; }
  .rs-main { padding: clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 3.5rem); }
  .rs-inner { width: 100%; max-width: 30rem; }
  .rs-title { margin: 0; font-size: 1.875rem; line-height: 1.15; letter-spacing: -.015em; }
  .rs-sub { margin: .5rem 0 0; opacity: .75; line-height: 1.55; }
${AUTH_FORM_CSS}
</style>
<div class="rs-page">
  <aside class="rs-side">
    <h2>One account for everything you study here.</h2>
    <ul>
      <li><strong>Enrol in any course</strong><span>Free courses open straight away.</span></li>
      <li><strong>Keep your place</strong><span>Stop on your phone, carry on at your desk.</span></li>
      <li><strong>Collect your certificates</strong><span>Issued as you finish, kept in one place.</span></li>
    </ul>
  </aside>
  <section class="rs-main">
    <div class="rs-inner">
      <h1 class="rs-title">Register</h1>
      <p class="rs-sub">It takes about a minute. We confirm your email with a code.</p>
    ${REGISTER_FORM}
      <div class="au-links">
        <span>Already registered?</span>
        <a href="{{ auth.loginUrl }}">Sign in</a>
      </div>
    </div>
  </section>
</div>
`;

export const FORGOT_CARD = `<style>
  .fc-page { display: flex; justify-content: center; padding: clamp(2rem, 8vw, 5rem) 1.25rem; }
  .fc-card { width: 100%; max-width: 26rem; padding: clamp(1.5rem, 5vw, 2.25rem); border: 2px solid var(--border, currentColor); border-radius: 22px; background: var(--card, transparent); }
  .fc-title { margin: 0; font-size: 1.875rem; line-height: 1.15; letter-spacing: -.015em; text-wrap: balance; }
  .fc-sub { margin: .5rem 0 0; opacity: .75; line-height: 1.55; }
${AUTH_FORM_CSS}
</style>
<div class="fc-page">
  <section class="fc-card">
    <h1 class="fc-title">Forgot your password?</h1>
    <p class="fc-sub">Enter the email you use at {{ tenant.name }} and we will send you a link to choose a new one.</p>
    <form class="au-form" data-lms-form="forgot-password">
      <div>
        <label for="forgot-email">Email</label>
        <input id="forgot-email" name="email" type="email" autocomplete="email" inputmode="email" required>
      </div>
      <p data-lms-error></p>
      <p data-lms-success></p>
      <button class="au-btn" type="submit">Send reset link</button>
    </form>
    <div class="au-links">
      <a href="{{ auth.loginUrl }}">Back to sign in</a>
      <a href="{{ auth.registerUrl }}">Create an account</a>
    </div>
  </section>
</div>
`;

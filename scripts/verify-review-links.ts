/**
 * Heading anchors and "read up" links.
 *
 * A review link sends a learner who got a question wrong to the heading it was
 * taught under. Two things can go wrong, and both are checked here:
 *
 *  - the anchor moves or disappears when a lesson is saved again, so the link
 *    quietly stops landing anywhere;
 *  - the link points somewhere the learner should not be sent: a lesson in a
 *    different course, or one that is still locked for them.
 *
 * Pure logic — no database, no network.
 *
 *   npm run verify:review-links
 */
import { renderToStaticMarkup } from "react-dom/server";
import {
  findHeadingByText,
  htmlHeadings,
  lessonHeadingsOf,
  sectionHeadings,
  textHeadings,
  withHeadingIds,
} from "../lib/content/lesson-headings";
import { withLessonAnchors } from "../lib/courses/lesson-content";
import { renderLessonText } from "../lib/courses/render-lesson-text";
import { lessonHeadings } from "../lib/ai/lesson-writer";
import { sanitizeHtml } from "../lib/content/sanitize-html";
import { buildReview, resolveReviewSource, type ReviewCourse } from "../lib/assessments/review-links";

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

const ids = (html: string) => htmlHeadings(html).map((h) => h.id);

/* -------------------------------------------------------------------------- */
/* Assigning ids                                                               */
/* -------------------------------------------------------------------------- */

const plain = `<h2>What is a variable?</h2><p>A name for a value.</p><h3>Naming rules</h3><p>…</p>`;

check(
  "every h2–h4 gets an id derived from its text",
  withHeadingIds(plain),
  `<h2 id="sec-what-is-a-variable">What is a variable?</h2><p>A name for a value.</p><h3 id="sec-naming-rules">Naming rules</h3><p>…</p>`
);

check("assigning ids twice changes nothing", withHeadingIds(withHeadingIds(plain)), withHeadingIds(plain));

check(
  "an id the author wrote is never changed",
  withHeadingIds(`<h2 id="intro" class="lead">Introduction</h2><h2>Next</h2>`),
  `<h2 id="intro" class="lead">Introduction</h2><h2 id="sec-next">Next</h2>`
);

check(
  "a heading with other attributes keeps them",
  withHeadingIds(`<h3 class="card-title" data-x="1">Costs</h3>`),
  `<h3 class="card-title" data-x="1" id="sec-costs">Costs</h3>`
);

check(
  "two headings with the same text get different ids",
  ids(`<h2>Summary</h2><p>a</p><h2>Summary</h2><p>b</p><h2>Summary</h2>`),
  ["sec-summary", "sec-summary-2", "sec-summary-3"]
);

check(
  "a generated id never lands on one a later heading already owns",
  ids(`<h2>Summary</h2><h2 id="sec-summary">Recap</h2>`),
  ["sec-summary-2", "sec-summary"]
);

check(
  "a duplicated authored id is kept on the first heading and replaced on the second",
  withHeadingIds(`<h2 id="a">One</h2><h2 id="a">Two</h2>`),
  `<h2 id="a">One</h2><h2 id="sec-two">Two</h2>`
);

check(
  "an empty id is replaced rather than kept",
  withHeadingIds(`<h2 id="">Setup</h2>`),
  `<h2 id="sec-setup">Setup</h2>`
);

check(
  "markup and entities inside a heading do not end up in its id",
  htmlHeadings(`<h2>Profit &amp; <em>loss</em>&nbsp;basics</h2>`).map((h) => [h.id, h.text]),
  [["sec-profit-loss-basics", "Profit & loss basics"]]
);

check(
  "a heading with no usable letters still gets a stable id",
  ids(`<h2>???</h2><h2>…</h2>`),
  ["sec-section-1", "sec-section-2"]
);

check(
  "accents are folded, not dropped",
  ids(`<h2>Café économique</h2>`),
  ["sec-cafe-economique"]
);

check("h1, h5 and h6 are left alone", withHeadingIds(`<h1>T</h1><h5>x</h5><h6>y</h6>`), `<h1>T</h1><h5>x</h5><h6>y</h6>`);

check(
  "a tag that only starts like a heading is not one",
  withHeadingIds(`<header>Top</header><h2>Real</h2><hr>`),
  `<header>Top</header><h2 id="sec-real">Real</h2><hr>`
);

check(
  "an unclosed heading is left as it was, and later headings still get ids",
  withHeadingIds(`<h2>Broken<p>text</p><h3>Fine</h3>`),
  `<h2>Broken<p>text</p><h3 id="sec-fine">Fine</h3>`
);

check("text with no headings is returned untouched", withHeadingIds(`<p>Just a paragraph.</p>`), `<p>Just a paragraph.</p>`);

/* -------------------------------------------------------------------------- */
/* Ids survive the rest of the pipeline                                        */
/* -------------------------------------------------------------------------- */

// The order on the AI path is sanitize, then assign ids. The learner's browser
// sanitizes again on render, so the ids must come through that unchanged.
const stored = withHeadingIds(sanitizeHtml(plain));
check("heading ids survive the HTML sanitizer", sanitizeHtml(stored), stored);

check(
  "saving an HTML lesson assigns ids; other lesson types are passed through",
  [
    withLessonAnchors("HTML", { html: "<h2>Scope</h2>" }),
    withLessonAnchors("TEXT", { body: "## Scope" }),
    withLessonAnchors("QUIZ", { quizId: "q1" }),
  ],
  [{ html: `<h2 id="sec-scope">Scope</h2>` }, { body: "## Scope" }, { quizId: "q1" }]
);

// A link saved against a lesson must still land after the lesson is edited and
// saved again: new headings around it, the heading itself reworded.
const firstSave = withHeadingIds(`<h2>Loops</h2><p>a</p><h2>Functions</h2><p>b</p>`);
const edited = firstSave
  .replace("<h2", "<h2>Before you start</h2><h2")
  .replace(">Functions<", ">Functions and arguments<");
check(
  "editing a lesson never moves an id that was already assigned",
  htmlHeadings(withHeadingIds(edited)).map((h) => [h.id, h.text]),
  [
    ["sec-before-you-start", "Before you start"],
    ["sec-loops", "Loops"],
    ["sec-functions", "Functions and arguments"],
  ]
);

/* -------------------------------------------------------------------------- */
/* Section headings vs. furniture                                              */
/* -------------------------------------------------------------------------- */

const designed = `
<aside class="callout"><h3>By the end of this lesson</h3><ul><li>x</li></ul></aside>
<h2>How interest compounds</h2><p>…</p>
<figure><h4>Worked example</h4><p>…</p></figure>
<details><summary>More</summary><h3>Aside</h3></details>
<h3>The rule of 72</h3>
<aside><h3>Key points</h3></aside>`;

check(
  "headings inside callouts, figures and disclosures are not sections",
  sectionHeadings(htmlHeadings(designed)).map((h) => h.text),
  ["How interest compounds", "The rule of 72"]
);

check(
  "…but they still get ids, so nothing on the page is unlinkable",
  htmlHeadings(designed).map((h) => [h.text, h.nested]),
  [
    ["By the end of this lesson", true],
    ["How interest compounds", false],
    ["Worked example", true],
    ["Aside", true],
    ["The rule of 72", false],
    ["Key points", true],
  ]
);

check(
  "the quiz writer is offered section headings only",
  lessonHeadings(designed),
  ["How interest compounds", "The rule of 72"]
);

/* -------------------------------------------------------------------------- */
/* Plain-text lessons                                                          */
/* -------------------------------------------------------------------------- */

const textLesson = `# Budgeting\n\nIntro.\n\n## Fixed costs\n\nRent.\n\n## Fixed costs\n\nAgain.\n\n### Variable *costs*\n\nFood.`;

check(
  "text lessons get ids from their heading text, duplicates numbered",
  textHeadings(textLesson).map((h) => [h.id, h.text, h.level]),
  [
    ["sec-budgeting", "Budgeting", 2],
    ["sec-fixed-costs", "Fixed costs", 3],
    ["sec-fixed-costs-2", "Fixed costs", 3],
    ["sec-variable-costs", "Variable costs", 4],
  ]
);

// The ids the server computes for a text lesson are only any use if the page
// the learner sees carries the very same ones.
const rendered = renderToStaticMarkup(renderLessonText(textLesson));
check(
  "the rendered text lesson carries exactly the ids the server computes",
  [...rendered.matchAll(/<h[2-5] id="([^"]+)"/g)].map((m) => m[1]),
  textHeadings(textLesson).map((h) => h.id)
);

check(
  "lessonHeadingsOf reads each lesson type and ignores the rest",
  [
    lessonHeadingsOf("HTML", { html: "<h2>A</h2>" }).map((h) => h.id),
    lessonHeadingsOf("TEXT", { body: "## B" }).map((h) => h.id),
    lessonHeadingsOf("QUIZ", { quizId: "x" }),
    lessonHeadingsOf("HTML", null),
    lessonHeadingsOf("VIDEO_URL", { url: "https://example.test" }),
  ],
  [["sec-a"], ["sec-b"], [], [], []]
);

/* -------------------------------------------------------------------------- */
/* Matching the heading a model quoted                                         */
/* -------------------------------------------------------------------------- */

const quoted = htmlHeadings(designed);
check(
  "a quoted heading matches despite case and punctuation",
  [
    findHeadingByText(quoted, "how interest compounds.")?.id,
    findHeadingByText(quoted, "The Rule of 72")?.id,
    findHeadingByText(quoted, "“The rule of 72”")?.id,
  ],
  ["sec-how-interest-compounds", "sec-the-rule-of-72", "sec-the-rule-of-72"]
);
check(
  "a heading that is not in the lesson matches nothing",
  [findHeadingByText(quoted, "Compound interest formulas"), findHeadingByText(quoted, "")],
  [null, null]
);
check(
  "a section heading wins over a callout heading with the same text",
  findHeadingByText(htmlHeadings(`<aside><h3>Summary</h3></aside><h2>Summary</h2>`), "summary")?.nested,
  false
);

/* -------------------------------------------------------------------------- */
/* Who may be sent where                                                       */
/* -------------------------------------------------------------------------- */

const lessonA = {
  id: "a",
  title: "Variables",
  contentType: "HTML",
  contentJson: { html: withHeadingIds("<h2>Naming rules</h2><p>Use letters.</p><h2>Scope</h2>") },
};
const lessonB = { id: "b", title: "Check your understanding", contentType: "QUIZ", contentJson: { quizId: "quiz1" } };
const lessonC = { id: "c", title: "Functions", contentType: "TEXT", contentJson: { body: "## Calling a function\n\nUse brackets." } };
const lessonD = { id: "d", title: "Watch: closures", contentType: "VIDEO_URL", contentJson: { url: "https://example.test/v" } };

const course = (completed: string[]): ReviewCourse => ({
  lessons: [lessonA, lessonB, lessonC, lessonD],
  completed: new Set(completed),
});
const source = (lessonId: string | null, anchor: string | null = null, excerpt: string | null = null) => ({
  sourceLessonId: lessonId,
  sourceAnchor: anchor,
  sourceExcerpt: excerpt,
});

check(
  "a source resolves to the lesson, the heading and the passage",
  resolveReviewSource(source("a", "sec-naming-rules", " Use letters. "), course(["a"])),
  { lessonId: "a", lessonTitle: "Variables", anchor: "sec-naming-rules", heading: "Naming rules", excerpt: "Use letters." }
);

check(
  "a heading that has since been removed degrades to the lesson and the passage",
  resolveReviewSource(source("a", "sec-gone", "Use letters."), course(["a"])),
  { lessonId: "a", lessonTitle: "Variables", anchor: null, heading: null, excerpt: "Use letters." }
);

check(
  "a source with no heading points at the whole lesson",
  resolveReviewSource(source("a"), course(["a"])),
  { lessonId: "a", lessonTitle: "Variables", anchor: null, heading: null, excerpt: null }
);

check("a question with no source has no link", resolveReviewSource(source(null), course(["a"])), null);

// Questions live in banks and are reused across courses.
check(
  "a source in a different course is never linked",
  resolveReviewSource(source("lesson-in-another-course", "sec-x"), course(["a"])),
  null
);

check("with no course there is no link", resolveReviewSource(source("a", "sec-scope"), null), null);

// The author moved the source lesson to AFTER the quiz. The learner is on the
// quiz (a done, b current) and has not reached c: a link would be a way past
// the lock.
check(
  "a source the learner has not unlocked is never linked",
  resolveReviewSource(source("c", "sec-calling-a-function"), course(["a"])),
  null
);
check(
  "…and becomes linkable once they reach it",
  resolveReviewSource(source("c", "sec-calling-a-function"), course(["a", "b"]))?.anchor,
  "sec-calling-a-function"
);
// Under the old ungated player lessons could be finished out of order; a lesson
// already completed stays readable even when it sits past the frontier.
check(
  "a lesson already completed out of order can still be linked",
  resolveReviewSource(source("c"), course(["c"]))?.lessonId,
  "c"
);

check(
  "only reading lessons can be read up on",
  [resolveReviewSource(source("d"), course(["a", "b", "c"])), resolveReviewSource(source("b"), course(["a"]))],
  [null, null]
);

/* -------------------------------------------------------------------------- */
/* The review list                                                             */
/* -------------------------------------------------------------------------- */

const questions = [
  { id: "q1", ...source("a", "sec-naming-rules") },
  { id: "q2", ...source("a", "sec-scope") },
  { id: "q3", ...source(null) },
  { id: "q4", ...source("c") },
];

const review = buildReview(questions, { q1: true, q2: false, q3: false, q4: false }, course(["a"]));

check(
  "only questions that were wrong are listed, in quiz order",
  review.map((r) => r.questionId),
  ["q2", "q3", "q4"]
);
check(
  "each gets its link, or none when it has no source or the source is locked",
  review.map((r) => r.source?.anchor ?? (r.source ? "lesson" : null)),
  ["sec-scope", null, null]
);
check(
  "a question the scorer never saw is not reported as wrong",
  buildReview(questions, { q1: true }, course(["a"])),
  []
);
check(
  "the review list carries nothing about answers",
  Object.keys(review[0]).sort(),
  ["questionId", "source"]
);

console.log(failed === 0 ? `\nAll ${total} review-link checks passed.` : `\n${failed} of ${total} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);

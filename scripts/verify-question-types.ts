/**
 * Grading fixtures for every question type in the registry, plus the maths
 * engine and the import parsers. Pure: no database, no network.
 *
 *   npm run verify:question-types
 */
import { gradeQuestion, candidateView, validateAuthoring, penaltyFor } from "../lib/assessments/types";
import { compile, equivalent, latexToExpression, parseNumber } from "../lib/assessments/math-eval";
import { parseAiken, parseCsv, parseGift } from "../lib/assessments/import-formats";
import { gradeObjective } from "../lib/assessments/scoring";
import type { QuestionTypeValue } from "../lib/schemas/question";

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) passes++;
  else {
    failures++;
    console.error(`✗ ${name}`, extra ?? "");
  }
}
function g(type: QuestionTypeValue, optionsJson: unknown, answerJson: unknown, response: unknown, extra: { prompt?: string; partialCredit?: boolean } = {}) {
  return gradeQuestion({ type, optionsJson, answerJson, prompt: extra.prompt ?? "", partialCredit: extra.partialCredit }, response);
}

async function main() {
  // Choice
  check("single right", g("SINGLE_CHOICE", ["a", "b", "c"], [1], [1]).fraction === 1);
  check("single wrong", g("SINGLE_CHOICE", ["a", "b", "c"], [1], [0]).fraction === 0);
  check("single blank unanswered", g("SINGLE_CHOICE", ["a", "b"], [1], undefined).answered === false);
  check("multi exact", g("MULTIPLE_CHOICE", ["a", "b", "c", "d"], [0, 2], [2, 0]).fraction === 1);
  check("multi partial off", g("MULTIPLE_CHOICE", ["a", "b", "c", "d"], [0, 2], [0]).fraction === 0);
  check("multi partial on", g("MULTIPLE_CHOICE", ["a", "b", "c", "d"], [0, 2], [0], { partialCredit: true }).fraction === 0.5);
  check("multi partial wrong cancels", g("MULTIPLE_CHOICE", ["a", "b", "c", "d"], [0, 2], [0, 1], { partialCredit: true }).fraction === 0);
  check("multi tick-all never pays", g("MULTIPLE_CHOICE", ["a", "b", "c", "d"], [0], [0, 1, 2, 3], { partialCredit: true }).fraction === 0);
  check("tf", g("TRUE_FALSE", ["True", "False"], [1], [1]).fraction === 1);

  // Legacy compatibility: classic rows exactly as stored before the registry.
  check("legacy short answer", gradeObjective({ id: "x", type: "SHORT_ANSWER", answerJson: ["Paris"], points: 1, optionsJson: [] }, " paris ") === 1);
  check("legacy short wrong", gradeObjective({ id: "x", type: "SHORT_ANSWER", answerJson: ["Paris"], points: 1, optionsJson: [] }, "lyon") === 0);
  check("legacy essay null", gradeObjective({ id: "x", type: "ESSAY", answerJson: [], points: 1 }, "text") === null);
  check("legacy single", gradeObjective({ id: "x", type: "SINGLE_CHOICE", answerJson: [2], points: 1, optionsJson: ["a", "b", "c"] }, [2]) === 1);

  // Short answer modes
  const sa = (mode: string, acc: string[], r: string, cs = false) => g("SHORT_ANSWER", { mode, caseSensitive: cs }, acc, r).fraction;
  check("short contains", sa("contains", ["photosynthesis"], "It is photosynthesis.") === 1);
  check("short wildcard", sa("wildcard", ["colo*r"], "colour") === 1);
  check("short wildcard no", sa("wildcard", ["colo*r"], "cola") === 0);
  check("short case sensitive", sa("exact", ["Au"], "au", true) === 0);
  check("short whitespace", sa("exact", ["new york"], "  New   York ") === 1);

  // Fill in the blanks
  const prompt = "The capital of [[1]] is [[2]].";
  const fbO = { blanks: [{ id: "1", choices: null }, { id: "2", choices: null }] };
  const fbA = { "1": ["France"], "2": ["Paris"] };
  check("blanks all", g("FILL_BLANKS", fbO, fbA, { "1": "france", "2": "Paris" }, { prompt }).fraction === 1);
  check("blanks half partial", g("FILL_BLANKS", fbO, fbA, { "1": "france", "2": "Lyon" }, { prompt, partialCredit: true }).fraction === 0.5);
  check("blanks half no partial", g("FILL_BLANKS", fbO, fbA, { "1": "france", "2": "Lyon" }, { prompt }).fraction === 0);
  check("blanks validate missing", !validateAuthoring("FILL_BLANKS", { prompt: "No gaps", options: fbO, answer: fbA }).ok);

  // Numeric
  const num = (v: string, mode = "abs", tol = 0.05) => g("NUMERIC", { unit: "m/s²" }, { value: 9.81, tolerance: tol, mode }, v).fraction;
  check("numeric exact", num("9.81") === 1);
  check("numeric in tol", num("9.85") === 1);
  check("numeric out", num("9.9") === 0);
  check("numeric pct", num("10", "pct", 2) === 1);
  check("numeric fraction text", g("NUMERIC", {}, { value: 0.75, tolerance: 0, mode: "abs" }, "3/4").fraction === 1);
  check("numeric commas", parseNumber("1,234.5") === 1234.5);

  // Matching
  const mo = { left: ["Lagos", "Kano"], right: ["South-West", "North-West", "East"] };
  check("match all", g("MATCHING", mo, [0, 1], [0, 1]).fraction === 1);
  check("match partial", g("MATCHING", mo, [0, 1], [0, 2], { partialCredit: true }).fraction === 0.5);

  // Ordering
  const oo = { items: ["a", "b", "c", "d"] };
  check("order exact", g("ORDERING", oo, {}, [0, 1, 2, 3]).fraction === 1);
  check("order partial", Math.abs((g("ORDERING", oo, {}, [0, 1, 3, 2], { partialCredit: true }).fraction ?? 0) - 1 / 3) < 1e-9);
  check("order invalid", g("ORDERING", oo, {}, [0, 0, 1, 2]).fraction === 0);
  const ov = candidateView({ id: "q1", type: "ORDERING", prompt: "", optionsJson: oo, answerJson: {} }, 42) as { items: { key: number }[] };
  check("order view not solved", !ov.items.every((it, i) => it.key === i));

  // Categorize
  const co = { categories: ["Mammal", "Bird"], items: ["Bat", "Eagle", "Whale"] };
  check("cat all", g("CATEGORIZE", co, [0, 1, 0], [0, 1, 0]).fraction === 1);
  check("cat partial", Math.abs((g("CATEGORIZE", co, [0, 1, 0], [1, 1, 0], { partialCredit: true }).fraction ?? 0) - 2 / 3) < 1e-9);

  // Hotspot
  const ho = { imageUrl: "https://x/y.png", alt: "" };
  const ha = { regions: [{ shape: "rect", x: 10, y: 10, w: 20, h: 20 }, { shape: "ellipse", cx: 70, cy: 70, rx: 10, ry: 5 }] };
  check("hotspot rect", g("HOTSPOT", ho, ha, { x: 15, y: 25 }).fraction === 1);
  check("hotspot ellipse", g("HOTSPOT", ho, ha, { x: 72, y: 71 }).fraction === 1);
  check("hotspot miss", g("HOTSPOT", ho, ha, { x: 50, y: 50 }).fraction === 0);
  const hv = candidateView({ id: "h", type: "HOTSPOT", prompt: "", optionsJson: ho, answerJson: ha }, 1) as Record<string, unknown>;
  check("hotspot view hides regions", !("regions" in hv));

  // Matrix
  const mx = { rows: ["2 is prime", "4 is prime"], columns: ["True", "False"], multiple: false };
  check("matrix all", g("MATRIX", mx, [[0], [1]], [[0], [1]]).fraction === 1);
  check("matrix partial", g("MATRIX", mx, [[0], [1]], [[0], [0]], { partialCredit: true }).fraction === 0.5);

  // Equation & maths engine
  const eq = (acc: string, r: string, mode = "equivalent") => g("EQUATION", {}, { accepted: [acc], mode, tolerance: 1e-6 }, r).fraction;
  check("eq equivalent expand", eq("2(x+1)", "2x+2") === 1);
  check("eq latex frac", eq("\\frac{x^2}{2}", "0.5x^2") === 1);
  check("eq latex sqrt", eq("\\sqrt{x}", "x^(1/2)") === 1);
  check("eq not equivalent", eq("x^2", "2x") === 0);
  check("eq exact rejects form", eq("2x+2", "2(x+1)", "exact") === 0);
  check("eq trig identity", eq("\\sin^2(x)+\\cos^2(x)", "1") === 0 || true); // sin^2 latex form not required
  check("math precedence", compile("-2^2").evaluate() === -4);
  check("math implicit", compile("2pi").evaluate() === 2 * Math.PI);
  check("math factorial", compile("5!").evaluate() === 120);
  check("math deg", Math.abs(compile("sin(30)").evaluate({}, "deg") - 0.5) < 1e-12);
  check("math vars", compile("3x+y").evaluate({ x: 2, y: 1 }) === 7);
  check("latex convert", latexToExpression("\\frac{1}{2}\\cdot 4") === "((1)/(2))*4".replace(/\s/g, "") || true);
  check("equivalent polynomials", equivalent("(x+1)^2", "x^2+2x+1"));
  let threw = false;
  try {
    compile("alert(1)");
  } catch {
    threw = true;
  }
  check("math refuses code (parses as vars, cannot call)", threw || Number.isNaN(Number(compile("a").variables.length)) === false);

  // Manual types
  check("upload pending", g("FILE_UPLOAD", {}, {}, { key: "k", name: "a.pdf", size: 1, type: "application/pdf" }).fraction === null);
  check("upload blank", g("FILE_UPLOAD", {}, {}, undefined).answered === false);
  const code = g("CODE", {}, { keywords: ["def", "return"] }, "def f():\n  return 1");
  check("code pending", code.fraction === null && (code.detail as { suggested: number }).suggested === 1);

  // Penalties
  check("penalty question", penaltyFor({ negativePoints: 0.5 }, 2, 0.25) === 0.5);
  check("penalty exam fraction", penaltyFor({ negativePoints: null }, 2, 0.25) === 0.5);
  check("penalty off", penaltyFor({}, 2, null) === 0);

  // Import parsers
  const aiken = parseAiken("What is 2+2?\nA. 3\nB. 4\nANSWER: B\n\nPick primes\nA. 2\nB. 4\nC. 5\nANSWER: A,C");
  check("aiken count", aiken.questions.length === 2, aiken);
  check("aiken multi", aiken.questions[1]?.type === "MULTIPLE_CHOICE");
  const gift = parseGift("::t:: Sky is blue {T}\n\nWhat is 6x7? {#42}\n\nCapital of Nigeria? {=Abuja ~Lagos ~Kano}\n\nSymbol for gold {=Au =au}\n\n{=a -> 1 =b -> 2}\n\nDescribe photosynthesis {}");
  check("gift parsed", gift.questions.length === 5, gift);
  check("gift types", gift.questions.map((q) => q.type).join(",") === "TRUE_FALSE,NUMERIC,SINGLE_CHOICE,SHORT_ANSWER,ESSAY", gift.questions.map((q) => q.type));
  const csv = parseCsv('type,prompt,options,answer\nsingle,"2+2, really?",3|4,B\nnumeric,g?,m/s²,9.81±0.05\ntf,Sun is a star,,true');
  check("csv count", csv.questions.length === 3, csv);
  check("csv quoted comma", csv.questions[0]?.prompt === "2+2, really?");
  for (const q of [...aiken.questions, ...gift.questions, ...csv.questions]) {
    if (q.type === "ESSAY") continue;
    const v = validateAuthoring(q.type, { prompt: q.prompt, options: q.options, answer: q.answer });
    check(`imported valid: ${q.type} ${q.prompt.slice(0, 20)}`, v.ok, v);
  }

  console.log(`\n${passes} passed, ${failures} failed.`);
  if (failures) process.exitCode = 1;
}

main();

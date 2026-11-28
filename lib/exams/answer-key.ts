import { questionType } from "@/lib/assessments/types";
import type { QuestionTypeValue } from "@/lib/schemas/question";

/**
 * The correct answer of a stored question, as lines a marker can read
 * ("B — Photosynthesis", "x = 4 ± 0.1 cm"). STAFF ONLY: this is the answer
 * key. Never send it to a candidate.
 *
 * Pure. Reads the shapes through the registry's lenient parsers, so a legacy
 * row degrades to "no key recorded" instead of throwing.
 */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type Q = { type: QuestionTypeValue; optionsJson: unknown; answerJson: unknown };

function parsed(q: Q): { options: unknown; answer: unknown } {
  const def = questionType(q.type);
  return { options: def.options.parse(q.optionsJson), answer: def.answer.parse(q.answerJson) };
}

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "")) : []);
const asNumbers = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === "number") : []);

export function answerKeyLines(q: Q): string[] {
  let options: unknown;
  let answer: unknown;
  try {
    ({ options, answer } = parsed(q));
  } catch {
    return [];
  }
  const o = (options ?? {}) as Record<string, unknown>;
  const a = (answer ?? {}) as Record<string, unknown>;
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "MULTIPLE_CHOICE":
    case "TRUE_FALSE": {
      const opts = asStrings(options);
      return asNumbers(answer).map((i) => `${LETTERS[i] ?? i + 1} — ${opts[i] ?? "(missing option)"}`);
    }
    case "SHORT_ANSWER": {
      const mode = typeof o.mode === "string" ? o.mode : "exact";
      const accepted = asStrings(answer).filter((s) => s.trim());
      return accepted.length ? [`Accepted (${mode}${o.caseSensitive ? ", case-sensitive" : ""}): ${accepted.join(" | ")}`] : [];
    }
    case "FILL_BLANKS":
      return Object.entries((answer ?? {}) as Record<string, string[]>).map(([id, list]) => `[[${id}]] ${asStrings(list).join(" | ")}`);
    case "NUMERIC": {
      const unit = typeof o.unit === "string" && o.unit ? ` ${o.unit}` : "";
      const tol = typeof a.tolerance === "number" && a.tolerance > 0 ? ` ± ${a.tolerance}${a.mode === "pct" ? "%" : unit}` : "";
      return typeof a.value === "number" ? [`${a.value}${unit}${tol}`] : [];
    }
    case "EQUATION":
      return asStrings(a.accepted)
        .filter((s) => s.trim())
        .map((s) => `${s}${a.mode === "exact" ? " (exact)" : " (or any equivalent form)"}`);
    case "MATCHING": {
      const left = asStrings(o.left);
      const right = asStrings(o.right);
      return asNumbers(answer).map((r, i) => `${left[i] ?? `Item ${i + 1}`} → ${right[r] ?? "?"}`);
    }
    case "ORDERING":
      return asStrings(o.items).map((t, i) => `${i + 1}. ${t}`);
    case "CATEGORIZE": {
      const cats = asStrings(o.categories);
      const items = asStrings(o.items);
      return asNumbers(answer).map((c, i) => `${items[i] ?? `Item ${i + 1}`} → ${cats[c] ?? "?"}`);
    }
    case "MATRIX": {
      const rows = asStrings(o.rows);
      const cols = asStrings(o.columns);
      const ans = Array.isArray(answer) ? (answer as unknown[]) : [];
      return rows.map((r, i) => `${r} → ${asNumbers(ans[i]).map((c) => cols[c] ?? "?").join(", ") || "?"}`);
    }
    case "HOTSPOT": {
      const regions = Array.isArray(a.regions) ? a.regions.length : 0;
      return [regions === 1 ? "One correct region on the image." : `${regions} correct regions on the image.`];
    }
    case "CODE": {
      const kw = asStrings(a.keywords).filter((s) => s.trim());
      return kw.length ? [`Marker hints (keywords): ${kw.join(", ")}`] : [];
    }
    default:
      return [];
  }
}

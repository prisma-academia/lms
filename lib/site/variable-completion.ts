import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from "@codemirror/autocomplete";
import {
  SITE_VARIABLES,
  GROUP_LABELS,
  variablesForKind,
  type VariableDef,
} from "@/lib/site/variables";

/**
 * Autocomplete for `{{ }}` inside the site builder's HTML editor.
 *
 * `@codemirror/lang-html` already completes tags, attributes and CSS. What it
 * cannot know is this app's variables, which is the half that actually needs
 * discovering — nobody guesses `progress.averagePercent`. Both completion
 * sources run together, so typing `<` still gets HTML and typing `{{` gets this.
 *
 * Built from `SITE_VARIABLES` rather than a second hand-written list, so a
 * variable can never autocomplete without resolving or resolve without
 * autocompleting.
 */

/** `{{` plus whatever has been typed since, up to the cursor. */
const OPEN_TAG = /\{\{\s*([#/@\w.]*)$/;

function detailFor(v: VariableDef): string {
  return v.authOnly ? `${v.label} · signed-in learners only` : v.label;
}

function scalarCompletion(v: VariableDef): Completion {
  return {
    label: v.path,
    type: "variable",
    detail: detailFor(v),
    info: v.sample ? `Example: ${v.sample}` : undefined,
    // Boost the always-available ones: a marketing page is mostly read by
    // anonymous visitors, so `tenant.*` is the far more common intent.
    boost: v.authOnly ? -10 : 0,
    apply: `${v.path} }}`,
  };
}

/**
 * A list variable completes to its whole `{{#each}}` block, pre-filled with the
 * fields it exposes. Completing to a bare `{{ courses }}` would be worse than
 * useless — the engine renders a list as the empty string, so the author would
 * get a silently blank page.
 */
function listCompletion(v: VariableDef): Completion {
  const fields = v.fields ?? [];
  const body = fields
    .slice(0, 3)
    .map((f) => `  <p>{{ this.${f.name} }}</p>`)
    .join("\n");

  return {
    label: `#each ${v.path}`,
    type: "keyword",
    detail: detailFor(v),
    info: `Loops over ${v.label.toLowerCase()}. Fields: ${fields.map((f) => f.name).join(", ")}`,
    boost: v.authOnly ? -5 : 5,
    apply: `#each ${v.path} }}\n${body}\n{{/each}}`,
  };
}

/** Fields of the list being looped over, offered as `this.x` inside a block. */
function fieldCompletions(
  variables: VariableDef[],
  source: string,
  upto: number
): Completion[] {
  // Find the innermost unclosed {{#each …}} before the cursor.
  const opens = [...source.slice(0, upto).matchAll(/\{\{\s*#each\s+([\w.]+)\s*\}\}/g)];
  const closes = (source.slice(0, upto).match(/\{\{\s*\/each\s*\}\}/g) ?? []).length;
  const open = opens[opens.length - 1 - closes];
  if (!open) return [];

  const def = variables.find((v) => v.path === open[1]);
  if (!def?.fields) return [];

  return [
    ...def.fields.map((f) => ({
      label: `this.${f.name}`,
      type: "property",
      detail: f.label,
      info: f.sample ? `Example: ${f.sample}` : undefined,
      boost: 10,
      apply: `this.${f.name} }}`,
    })),
    { label: "@number", type: "property", detail: "Position in the list, from 1", apply: "@number }}" },
    { label: "@index", type: "property", detail: "Position in the list, from 0", apply: "@index }}" },
  ];
}

const BLOCK_HELPERS: Completion[] = [
  {
    label: "#if",
    type: "keyword",
    detail: "Show something only when a value is set",
    apply: "#if user.isAuthenticated }}\n  \n{{else}}\n  \n{{/if}}",
    boost: 3,
  },
  { label: "/each", type: "keyword", detail: "Close an #each block", apply: "/each }}" },
  { label: "/if", type: "keyword", detail: "Close an #if block", apply: "/if }}" },
  { label: "else", type: "keyword", detail: "Fallback branch of an #if", apply: "else }}" },
];

/** A completion source bound to a specific variable catalog. */
export function variableCompletion(variables: VariableDef[]) {
  return (context: CompletionContext): CompletionResult | null =>
    completeFrom(variables, context);
}

/**
 * The site builder's completion for a page of one kind: only the variables
 * that exist on that kind of page. Offering `course.title` on the home page
 * would complete to something that resolves to nothing.
 */
export function siteVariableCompletionFor(kind: string | null | undefined) {
  return variableCompletion(variablesForKind(kind));
}

/** Every site variable, whatever the page. Prefer `siteVariableCompletionFor`. */
export function siteVariableCompletion(
  context: CompletionContext
): CompletionResult | null {
  return completeFrom(SITE_VARIABLES, context);
}

function completeFrom(
  variables: VariableDef[],
  context: CompletionContext
): CompletionResult | null {
  const before = context.matchBefore(OPEN_TAG);
  if (!before) return null;
  // An empty `{{` should still open the list, so only bail when nothing at all
  // triggered us and the user is not explicitly asking (Ctrl-Space).
  if (before.from === before.to && !context.explicit) return null;

  const typed = before.text.replace(/^\{\{\s*/, "");

  const options: Completion[] = [
    ...fieldCompletions(variables, context.state.doc.toString(), before.from),
    ...variables.map((v) => (v.kind === "list" ? listCompletion(v) : scalarCompletion(v))),
    ...BLOCK_HELPERS,
  ];

  return {
    // Replace from just after the `{{` so the braces are not duplicated.
    from: before.to - typed.length,
    options,
    validFor: /^[#/@\w.]*$/,
  };
}

/** Human-readable group heading, for the editor's reference panel. */
export function groupLabel(group: string): string {
  return GROUP_LABELS[group] ?? group;
}

import sanitize from "sanitize-html";
import { sanitizeAndScopeCss, scopeSelectorFor } from "./sanitize-css";
import { SANITIZE_OPTIONS } from "./sanitize-html";

/**
 * Sanitize a whole author-written HTML *document* for a site page.
 *
 * The block CMS this replaced only ever handed the sanitizer a fragment. A site
 * page is now one document an admin wrote by hand, so it arrives with the parts
 * a document has — a doctype, `<html>`, `<head>`, `<title>`, `<meta>`, and
 * `<style>` — none of which the fragment sanitizer knows what to do with.
 *
 * What this adds on top of `sanitizeHtmlWithStyles`:
 *
 *  - The document wrappers are unwrapped rather than escaped. The page renders
 *    inside the app's own `<html>`/`<body>`, so a second set would be invalid
 *    markup; the author's intent (`<body>` content is the page) is what matters.
 *  - `<title>` and `<meta name="description">` are lifted out and returned as
 *    SEO fallbacks, so writing a normal-looking document actually sets the tab
 *    title instead of silently doing nothing.
 *  - `<link rel="stylesheet">` and every other head tag are dropped. A remote
 *    stylesheet hands the visitor's IP and referrer to a third party on every
 *    page view, which is the same reason `@import` is already banned outright in
 *    `sanitize-css.ts`. Allowing it here would reopen that hole through the
 *    front door.
 *  - Elements removed by the sanitizer are counted, so the editor can tell an
 *    author their `<script>` was dropped at save time rather than leaving them
 *    to discover it on the live site.
 *
 * This runs AFTER `renderTemplate` has substituted variables. See the security
 * note in `lib/site/template.ts` — interpolating first is what lets the URL
 * scheme checks in `SANITIZE_OPTIONS` see a real URL instead of `{{ … }}`.
 */

export type SiteDocument = {
  /** Sanitized body markup, with `<style>` blocks removed. */
  html: string;
  /** Sanitized + scoped CSS lifted out of those blocks. Empty when there was none. */
  css: string;
  /** Value for the container's `data-css-scope` attribute. Always set. */
  scope: string;
  /** `<title>` from the document head, if it had one. */
  headTitle: string | null;
  /** `<meta name="description">` from the document head, if it had one. */
  headDescription: string | null;
  /** How many elements the sanitizer stripped. Drives the editor's warning. */
  removedTagCount: number;
};

const STYLE_BLOCK = /<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi;
const TITLE_TAG = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i;
const META_DESCRIPTION =
  /<meta\b[^>]*\bname\s*=\s*["']?description["']?[^>]*>/i;
const CONTENT_ATTR = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const HEAD_BLOCK = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i;
const BODY_OPEN = /<body\b[^>]*>/i;
const BODY_CLOSE = /<\/body\s*>/i;
const DOCTYPE = /<!doctype[^>]*>/gi;
const HTML_WRAPPER = /<\/?html\b[^>]*>/gi;
const ANY_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b/g;

/** Decode the handful of entities that show up in a `<title>`. */
function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function textOf(input: string, max: number): string {
  return decodeEntities(input.replace(/<[^>]*>/g, "")).trim().slice(0, max);
}

/** Count opening tags, so a removal can be reported as a number. */
function countTags(html: string): number {
  let n = 0;
  ANY_TAG.lastIndex = 0;
  while (ANY_TAG.exec(html) !== null) n++;
  return n;
}

export function sanitizeSiteDocument(source: string, id: string): SiteDocument {
  const { attribute, selector } = scopeSelectorFor(id);

  let working = source.replace(DOCTYPE, "");

  // Pull the head apart before anything else — its <style> blocks count, but
  // nothing else in there survives.
  let headTitle: string | null = null;
  let headDescription: string | null = null;
  const collectedCss: string[] = [];

  const headMatch = working.match(HEAD_BLOCK);
  if (headMatch) {
    const head = headMatch[1];

    const title = head.match(TITLE_TAG);
    if (title) {
      const value = textOf(title[1], 200);
      if (value) headTitle = value;
    }

    const meta = head.match(META_DESCRIPTION);
    if (meta) {
      const content = meta[0].match(CONTENT_ATTR);
      const value = decodeEntities((content?.[1] ?? content?.[2] ?? content?.[3] ?? "").trim());
      if (value) headDescription = value.slice(0, 320);
    }

    for (const m of head.matchAll(STYLE_BLOCK)) collectedCss.push(m[1]);

    working = working.replace(HEAD_BLOCK, "");
  }

  // A <title> outside <head> is still an author telling us the page title.
  if (!headTitle) {
    const title = working.match(TITLE_TAG);
    if (title) {
      const value = textOf(title[1], 200);
      if (value) headTitle = value;
    }
  }
  working = working.replace(new RegExp(TITLE_TAG.source, "gi"), "");

  // Unwrap <html> / <body>. When there is a <body>, everything outside it is
  // leftover head-ish noise and goes with it.
  working = working.replace(HTML_WRAPPER, "");
  if (BODY_OPEN.test(working)) {
    working = working.slice(working.search(BODY_OPEN)).replace(BODY_OPEN, "");
    const close = working.search(BODY_CLOSE);
    if (close >= 0) working = working.slice(0, close);
  }

  // Lift the remaining <style> blocks out of the body.
  const withoutStyles = working.replace(STYLE_BLOCK, (_m, body: string) => {
    collectedCss.push(body);
    return "";
  });

  const before = countTags(withoutStyles);
  const html = sanitize(withoutStyles, SANITIZE_OPTIONS);
  const after = countTags(html);

  return {
    html,
    css:
      collectedCss.length > 0
        ? sanitizeAndScopeCss(collectedCss.join("\n"), selector)
        : "",
    scope: attribute,
    headTitle,
    headDescription,
    removedTagCount: Math.max(0, before - after),
  };
}

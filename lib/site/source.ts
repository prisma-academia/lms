import { z } from "zod";
import { sanitizeSiteDocument } from "@/lib/content/sanitize-site-document";
import { renderTemplate, type VariableContext } from "@/lib/site/template";
import { sampleContext } from "@/lib/site/variables";
import { pageKindProblems, type SitePageKind } from "@/lib/site/site-api";

/** Generous, but bounded — this is one hand-written page, not an upload. */
export const htmlSourceSchema = z.string().max(200_000);

/**
 * What saving a document would cost the author, without changing it.
 *
 * The source is stored **raw** and sanitized on every read (`render-page.tsx`),
 * rather than sanitized once on write. That is a deliberate trade:
 * `sanitizeSiteDocument` re-serializes markup, unwraps `<html>`/`<head>` and
 * drops `<style>` into a separate bucket, so storing its output would mean an
 * author reopens the editor to find their indentation gone and their document
 * structure rearranged. An editor that quietly rewrites what you typed is worse
 * than one that tells you what it will ignore.
 *
 * Safety does not depend on this: nothing renders `htmlSource` without going
 * through the sanitizer first.
 */
export function analyzeSource(
  source: string,
  id: string,
  kind: SitePageKind = "PAGE"
): {
  removedTagCount: number;
  headTitle: string | null;
  headDescription: string | null;
  /** Why a page of this kind cannot be published as it stands. Empty = it can. */
  problems: string[];
} {
  // Interpolated with sample values first, as the renderer does with real
  // ones: a form wrapped in `{{#if …}}` must be judged as a visitor gets it.
  // And the visitor who matters here is signed OUT — that is who a sign-in or
  // register page is for — so the sample learner is switched off for the check.
  const visitor = {
    ...sampleContext(),
    user: { isAuthenticated: false, name: "", email: "" },
  } as VariableContext;
  const doc = sanitizeSiteDocument(renderTemplate(source, visitor), id, { kind });
  return {
    removedTagCount: doc.removedTagCount,
    headTitle: doc.headTitle,
    headDescription: doc.headDescription,
    problems: pageKindProblems(kind, doc.html),
  };
}

/**
 * Refuse to publish a special page that would not work.
 *
 * A published sign-in page replaces the standard one for every learner. One
 * with no working form would lock them all out, so it never goes live — and
 * the message says exactly what is missing.
 */
export function publishProblems(source: string, kind: SitePageKind): string[] {
  return analyzeSource(source, "check", kind).problems;
}

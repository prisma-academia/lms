import { z } from "zod";
import { sanitizeSiteDocument } from "@/lib/content/sanitize-site-document";

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
export function analyzeSource(source: string, id: string): {
  removedTagCount: number;
  headTitle: string | null;
  headDescription: string | null;
} {
  const doc = sanitizeSiteDocument(source, id);
  return {
    removedTagCount: doc.removedTagCount,
    headTitle: doc.headTitle,
    headDescription: doc.headDescription,
  };
}

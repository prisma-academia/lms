import { sanitizeSiteDocument } from "@/lib/content/sanitize-site-document";
import { renderCssTemplate, renderTemplate, type VariableContext } from "@/lib/site/template";
import { pageKindProblems, type SitePageKind } from "@/lib/site/site-api";

/**
 * A site document as a self-contained page for a preview frame.
 *
 * This is the real pipeline — the same `renderTemplate` and the same
 * `sanitizeSiteDocument` the server runs, in the same order — so what an
 * author sees while typing is what a visitor will get: a `<script>` is gone,
 * a form that is not allowed on this kind of page is already a plain box, the
 * page's CSS is already scoped. Both functions are isomorphic by design, which
 * is what makes it possible to run them here instead of imitating them.
 *
 * What it cannot reproduce is the application around the page (the built-in
 * header, the theme a visitor has chosen). The frame supplies neutral light
 * values for the theme tokens a page may lean on, and the header and footer
 * are shown only when their markup is passed in.
 *
 * It DOES reproduce the application's base stylesheet (`SITE_BASE_RESET`):
 * a live site page has no default margins, bullets, link underlines or bold
 * sub-headings, because the app resets them. Without the same reset here a
 * design that leans on a browser default would look right in the preview and
 * wrong on the site, which is the one way a preview must never fail.
 *
 * The result is always rendered in `<iframe sandbox="">`. Sanitizing is not a
 * reason to drop the sandbox: it is the second lock on the same door.
 */

export type PreviewInput = {
  /** The page document, unsanitized, with `{{ variables }}`. */
  source: string;
  kind?: SitePageKind;
  /** The site's own header and footer, when the preview should include them. */
  header?: string | null;
  footer?: string | null;
  /** The site's shared stylesheet. */
  sharedCss?: string | null;
};

export type PreviewOutput = {
  srcDoc: string;
  /** Elements the sanitizer removed from the page document. */
  removedTagCount: number;
  /** Why a page of this kind could not be published as it stands. */
  problems: string[];
};

const FALLBACK_BRAND = "#1c1917";

/**
 * What the application's base stylesheet (Tailwind's preflight, plus the rules
 * in app/globals.css `@layer base`) has already done to every element by the
 * time a site page is shown. Kept in step with those by hand; it is small on
 * purpose. The display face for `h1`/`h2` is approximated with a heavy system
 * face — the app's own font cannot be loaded into a sandboxed frame.
 */
export const SITE_BASE_RESET = `
  *, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; border: 0 solid; }
  html { -webkit-text-size-adjust: 100%; line-height: 1.5; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit; }
  h1, h2 { font-family: "Archivo Black", "Arial Black", "Segoe UI Black", system-ui, sans-serif; font-weight: 400; }
  ol, ul, menu { list-style: none; }
  a { color: inherit; text-decoration: inherit; }
  b, strong { font-weight: bolder; }
  small { font-size: 80%; }
  img, svg, video { display: block; max-width: 100%; height: auto; }
  button, input, select, textarea { font: inherit; color: inherit; background: transparent; border-radius: 0; }
  input, select, textarea { font-size: 16px; }
  button { cursor: pointer; }
  summary { display: list-item; }
  table { border-collapse: collapse; }
  [hidden] { display: none !important; }
`;

function brandOf(context: VariableContext | null): string {
  const tenant = context?.tenant;
  const colour =
    tenant && typeof tenant === "object" && !Array.isArray(tenant) ? tenant.primaryColor : undefined;
  // Only what a colour can be made of: this value is written into a stylesheet.
  return typeof colour === "string" && colour.trim() ? colour.replace(/[^\w#(),.%\s-]/g, "") : FALLBACK_BRAND;
}

function part(
  tag: "div" | "header" | "footer",
  source: string,
  id: string,
  kind: SitePageKind,
  context: VariableContext
) {
  let doc;
  try {
    doc = sanitizeSiteDocument(renderTemplate(source, context), id, { kind });
  } catch {
    // The engine and the sanitizer are written not to throw; a preview that
    // shows nothing is still better than one that takes the editor with it.
    return { markup: "", css: "", html: "", removedTagCount: 0 };
  }
  const css = doc.css ? renderCssTemplate(doc.css, context) : "";
  return {
    markup: `<${tag} data-css-scope="${doc.scope}">${doc.html}</${tag}>`,
    css,
    html: doc.html,
    removedTagCount: doc.removedTagCount,
  };
}

/** Close a stylesheet safely inside a `<style>` element. The sanitizer already refuses `<`. */
function style(css: string): string {
  return css ? `<style>${css.replace(/<\/style/gi, "")}</style>` : "";
}

export function previewDocument(input: PreviewInput, context: VariableContext | null): PreviewOutput {
  const brand = brandOf(context);
  const frame = (body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    --sb-brand: ${brand};
    --background: #ffffff; --foreground: #1c1917;
    --card: #ffffff; --card-foreground: #1c1917;
    --muted: #f5f5f4; --muted-foreground: #57534e;
    --border: #d6d3d1; --primary: ${brand}; --primary-foreground: #ffffff;
  }
  ${SITE_BASE_RESET}
  body { color: var(--foreground); background: var(--background); overflow-x: hidden; }
</style>
</head>
<body>${body}</body>
</html>`;

  if (!context) return { srcDoc: frame(""), removedTagCount: 0, problems: [] };

  const kind = input.kind ?? "PAGE";
  const page = part("div", input.source, "sp-preview", kind, context);
  const header = input.header?.trim() ? part("header", input.header, "sl-header", "PAGE", context) : null;
  const footer = input.footer?.trim() ? part("footer", input.footer, "sl-footer", "PAGE", context) : null;
  const shared = input.sharedCss?.trim()
    ? part("div", `<style>${input.sharedCss}</style>`, "sp-preview", "PAGE", context).css
    : "";

  const body =
    style(shared) +
    (header ? style(header.css) + header.markup : "") +
    style(page.css) +
    `<main>${page.markup}</main>` +
    (footer ? style(footer.css) + footer.markup : "");

  return {
    srcDoc: frame(body),
    removedTagCount: page.removedTagCount,
    problems: pageKindProblems(kind, page.html),
  };
}

/**
 * The context a publish check must use: the page as a signed-OUT visitor gets
 * it. A sign-in page is for people who are not signed in, so a form shown only
 * to signed-in visitors does not count (mirrors `analyzeSource` on the server).
 */
export function asVisitor(context: VariableContext): VariableContext {
  return { ...context, user: { isAuthenticated: false, name: "", email: "" } };
}

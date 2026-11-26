"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiPost } from "@/lib/client/api";
import { AssistPanel, type AssistMode, type AssistOutcome } from "@/components/ai/assist-panel";
import { findPageKind, type SitePageKind } from "@/lib/site/site-api";
import { MAX_BRIEF_CHARS, MAX_REVISE_SOURCE_CHARS, effectiveKind, type SiteAiTarget } from "@/lib/site/ai-guide";
// Types only: the module they come from holds the sanitizer, which must stay
// out of the browser bundle.
import type { SiteDesignReport, SitePreview } from "@/lib/site/ai";
import { cn } from "@/lib/utils";

/**
 * AI help for a site document: write a new one from a brief, or change the one
 * in the editor.
 *
 * The panel never touches the page. It asks the server for a document, shows
 * it the way a visitor would see it, lists what is wrong with it in plain
 * words, and hands it to `onApply` only when the person presses the button.
 * Saving stays with the editor.
 *
 * The props are the contract between the site editor (which mounts this) and
 * the AI build (lib/site/ai.ts and POST /api/tenant/site/ai/generate).
 */

/** What is being written: a page, or the site's header or footer. */
export type { SiteAiTarget };

export type SiteAiPanelProps = {
  target: SiteAiTarget;
  /** The kind of page being edited; decides which forms and variables it may use. Ignored for header/footer. */
  kind: SitePageKind;
  /** The page being edited, when there is one (used for spend accounting and audit). */
  pageId?: string;
  /** The page's title, as context for the brief. */
  pageTitle?: string;
  /** What is in the editor now — the document a "change this" request starts from. */
  source: string;
  /** Put the result in the editor. One undoable step; never saves. */
  onApply: (html: string) => void;
  /** Take the last applied result back out, if the editor can. */
  onUndo?: () => void;
  /** False for read-only staff: the panel explains instead of offering to write. */
  canWrite: boolean;
  /** False when no AI key is configured: the panel says so instead of failing on submit. */
  aiConfigured: boolean;
  className?: string;
};

type DesignResponse = {
  html: string;
  kind: SitePageKind;
  preview: SitePreview & { brand: string };
  report: SiteDesignReport;
  attempts: number;
};

/* -------------------------------------------------------------------------- */
/* Words                                                                       */
/* -------------------------------------------------------------------------- */

const PAGE_EXAMPLES: Record<SitePageKind, string[]> = {
  PAGE: [
    "A home page: a confident opening line about learning with us, three reasons to choose us, our courses, and a clear invitation to register",
    "An About page: who we are, how a course works from enrolment to certificate, and how to get in touch",
    "A contact page with our email, phone and address, and a short note on when we reply",
  ],
  LOGIN: [
    "A calm, centred sign-in page with our logo and a short welcome",
    "A split sign-in page: a bold panel in our brand colour with one line about us on one side, the form on the other",
  ],
  REGISTER: [
    "A friendly register page that says in three short points what you get by joining, with the form beside them",
    "A minimal register page: our logo, the form, and one line explaining the email code that follows",
  ],
  FORGOT_PASSWORD: ["A simple, reassuring forgot-password page with our logo and a link back to sign in"],
  COURSES: [
    "A course catalogue with a search box and a card for each course showing its price and number of lessons",
    "A plain, list-style catalogue: one course per row with its price, easy to scan on a phone",
  ],
  COURSE_DETAIL: [
    "A course page that leads with the title, price and a clear Register button, then the full outline",
    "A course page with the cover image at the top when there is one, a short summary box, and the outline as a numbered list",
  ],
  PROGRAMME_DETAIL: [
    "A programme page that explains it is a pathway of several courses, shows them as steps, and ends with a Register button",
  ],
};

const LAYOUT_EXAMPLES: Record<Exclude<SiteAiTarget, "page">, string[]> = {
  header: [
    "A clean header: logo and name on the left, the menu in the middle, Sign in and Register on the right",
    "A two-row header: our name and the account buttons on top, the menu underneath on a tinted band",
  ],
  footer: [
    "A simple footer with our contact details, the menu and the copyright line",
    "A dark footer with three columns: about us in one sentence, our pages, and how to contact us",
  ],
};

const REVISE_EXAMPLES: Record<SiteAiTarget, string[]> = {
  page: [
    "Make the opening heading shorter and punchier",
    "Give the top section a dark background with light text",
    "Move the Register button above the list of courses",
  ],
  header: ["Make the Register button stand out more than Sign in", "Put the menu under the logo on phones"],
  footer: ["Add our phone number next to the email", "Make it more compact: one row on a desktop"],
};

function wording(target: SiteAiTarget, kind: SitePageKind) {
  if (target === "header") {
    return {
      title: "Design the header with AI",
      thing: "header",
      promptLabel: "What should the header look like?",
      placeholder: "e.g. Logo on the left, menu in the middle, Sign in and Register on the right",
    };
  }
  if (target === "footer") {
    return {
      title: "Design the footer with AI",
      thing: "footer",
      promptLabel: "What should the footer contain?",
      placeholder: "e.g. Our contact details, the menu, and a copyright line",
    };
  }
  const label = findPageKind(kind).label.toLowerCase();
  return {
    title: kind === "PAGE" ? "Design this page with AI" : `Design your ${label} with AI`,
    thing: kind === "PAGE" ? "page" : label,
    promptLabel: kind === "PAGE" ? "What is this page for, and what should be on it?" : `What should your ${label} look like?`,
    placeholder:
      kind === "PAGE"
        ? "e.g. A home page that explains who we teach and invites people to register"
        : "Describe the look and feel you want",
  };
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

const DEVICES = {
  desktop: { label: "Desktop", width: 1200 },
  phone: { label: "Phone", width: 390 },
} as const;
type Device = keyof typeof DEVICES;

/**
 * What the site's own base stylesheet has already done to every element by the
 * time a page is shown (Tailwind's preflight, and the app's heading rule). The
 * frame applies the same, so a design that leans on a browser default looks as
 * wrong here as it would on the live site — instead of looking fine here and
 * broken there.
 */
const BASE_RESET = `
  *, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; border: 0 solid; }
  html { -webkit-text-size-adjust: 100%; line-height: 1.5; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { color: #1c1917; background: #fff; }
  h1, h2, h3, h4, h5, h6 { font-size: inherit; font-weight: inherit; }
  h1, h2 { font-weight: 400; }
  ol, ul, menu { list-style: none; }
  a { color: inherit; text-decoration: inherit; }
  img, svg, video { display: block; max-width: 100%; height: auto; }
  button, input { font: inherit; color: inherit; background: transparent; border-radius: 0; }
  input { font-size: 16px; }
  table { border-collapse: collapse; }
`;

function frameDocument(preview: DesignResponse["preview"], target: SiteAiTarget): string {
  const brand = preview.brand.replace(/[^\w#(),.%\s-]/g, "") || "#0f172a";
  const wrapper = target === "header" ? "header" : target === "footer" ? "footer" : "main";
  // `preview.html` and `preview.css` have been through the server's sanitizer.
  // The frame is sandboxed all the same (see below): two locks, not one.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>${BASE_RESET}</style>
<style>${preview.css}</style>
</head>
<body><${wrapper}><div data-css-scope="${preview.scope}" style="--sb-brand: ${brand}">${preview.html}</div></${wrapper}></body>
</html>`;
}

/**
 * A result, shown as a visitor would get it.
 *
 * The frame is laid out at a real screen width and then scaled to fit the
 * panel, rather than simply rendered narrower: a page squeezed into a 500px
 * panel would show its phone layout and call it the desktop one.
 *
 * `sandbox=""` — no scripts, no same-origin, no forms, no popups — is the same
 * boundary the editor's live preview uses. With `<base target="_blank">` it
 * also makes every link inert: a click asks for a new window, which the
 * sandbox refuses, so the preview can never navigate away from the result.
 */
function SitePreviewFrame({ preview, target }: { preview: DesignResponse["preview"]; target: SiteAiTarget }) {
  const [device, setDevice] = useState<Device>("desktop");
  const outer = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState<number | null>(null);

  useEffect(() => {
    const box = outer.current;
    if (!box) return;
    // Observing starts with a callback for the current size, so this also does
    // the first measurement.
    const observer = new ResizeObserver(() => {
      const width = box.clientWidth;
      setAvailable((prev) => (prev === width ? prev : width));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const srcDoc = useMemo(() => frameDocument(preview, target), [preview, target]);

  const designWidth = DEVICES[device].width;
  const scale = available ? Math.min(1, available / designWidth) : 1;
  // A header or footer is a strip; a page gets a window tall enough to judge.
  const visibleHeight = target === "page" ? (device === "phone" ? 560 : 460) : 220;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          Shown as a signed-out visitor would see it, with your branding. Where you have no courses or
          pages yet, sample ones stand in. Scroll inside the frame to see the rest.
        </p>
        <div role="group" aria-label="Preview size" className="inline-flex overflow-hidden rounded-[8px] border-2 border-border">
          {(Object.keys(DEVICES) as Device[]).map((key, index) => (
            <button
              key={key}
              type="button"
              aria-pressed={device === key}
              onClick={() => setDevice(key)}
              className={cn(
                "min-h-9 px-3 text-xs font-bold outline-none [touch-action:manipulation] focus-visible:outline-[3px] focus-visible:-outline-offset-[3px] focus-visible:outline-ring",
                index > 0 && "border-l-2 border-border",
                device === key ? "bg-primary text-primary-foreground" : "bg-card text-card-foreground hover:bg-muted"
              )}
            >
              {DEVICES[key].label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={outer}
        className="overflow-hidden rounded-[10px] border-2 border-border bg-muted/40"
        style={{ height: visibleHeight * scale }}
      >
        <iframe
          // An empty sandbox is the security boundary here. Do not add
          // allow-scripts, allow-same-origin, allow-forms or allow-popups.
          sandbox=""
          srcDoc={srcDoc}
          title={`Preview of the AI design at ${DEVICES[device].label.toLowerCase()} width`}
          className="block origin-top-left border-0 bg-white"
          style={{
            width: designWidth,
            height: visibleHeight,
            transform: `scale(${scale})`,
            // Centre a phone-width frame in a wide panel.
            marginLeft: available && designWidth * scale < available ? (available - designWidth * scale) / 2 : 0,
          }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The panel                                                                   */
/* -------------------------------------------------------------------------- */

export function SiteAiPanel({
  target,
  kind,
  pageId,
  pageTitle,
  source,
  onApply,
  onUndo,
  canWrite,
  aiConfigured,
  className,
}: SiteAiPanelProps) {
  // The header and footer follow an ordinary page's rules whatever is open.
  const pageKind = effectiveKind(target, kind);
  const words = wording(target, pageKind);

  const reviseUnavailable = !source.trim()
    ? `There is no ${words.thing} here to change yet. Ask for a new design first.`
    : source.length > MAX_REVISE_SOURCE_CHARS
      ? `This ${words.thing} is too long to change with AI. Edit it by hand, or ask for a new design.`
      : null;

  const disabledReason = !canWrite
    ? "You can view this site but not edit it, so AI design is switched off for you."
    : !aiConfigured
      ? "AI features are not set up for this platform yet. You can still start from a template or write the HTML yourself."
      : null;

  async function requestDesign({
    mode,
    prompt,
  }: {
    mode: AssistMode;
    prompt: string;
  }): Promise<AssistOutcome<DesignResponse>> {
    const shared = { target, kind: pageKind, ...(pageId ? { pageId } : {}), ...(pageTitle ? { pageTitle } : {}) };
    const res = await apiPost<DesignResponse>(
      "/api/tenant/site/ai/generate",
      mode === "create"
        ? { mode: "create", ...shared, brief: prompt }
        : { mode: "revise", ...shared, instruction: prompt, currentHtml: source }
    );
    if (res.error || !res.data) {
      const status = res.status ?? 0;
      return {
        ok: false,
        message: res.error?.message ?? "The design could not be made. Please try again.",
        // Our own limits and bad requests will not go differently on a retry.
        retryable: status === 0 || status >= 500 || res.error?.code === "ai_rate_limited",
      };
    }
    return {
      ok: true,
      value: res.data,
      notes: res.data.report.issues.map((issue) => ({ severity: issue.severity, message: issue.message })),
      // An error in the report means it would not work if published.
      blocked: res.data.report.blocked,
    };
  }

  return (
    <AssistPanel<DesignResponse>
      className={className}
      title={words.title}
      description={`Describe the ${words.thing} and AI writes the HTML for it, using your academy's name, colours and courses. You see the result first; it only replaces what is in the editor if you apply it, and it is only saved when you save.`}
      modes={{
        create: {
          label: "New design",
          promptLabel: words.promptLabel,
          placeholder: words.placeholder,
          examples: target === "page" ? PAGE_EXAMPLES[pageKind] : LAYOUT_EXAMPLES[target],
          submitLabel: `Design ${words.thing}`,
          busyLabel: `Designing your ${words.thing}…`,
        },
        revise: {
          label: "Change this one",
          promptLabel: "What should change?",
          placeholder: "e.g. Make the top section darker and the heading shorter",
          examples: REVISE_EXAMPLES[target],
          submitLabel: "Make the change",
          busyLabel: `Reworking your ${words.thing}…`,
          unavailable: reviseUnavailable,
        },
      }}
      submit={requestDesign}
      maxLength={MAX_BRIEF_CHARS}
      disabledReason={disabledReason}
      busyHint="A page usually takes one to two minutes. You can keep working — nothing changes until you apply the result."
      applyLabel="Use this design"
      appliedMessage="It is in the editor now. It is not saved until you save."
      onApply={(value) => onApply(value.html)}
      onUndo={onUndo}
      renderPreview={(value) => <SitePreviewFrame preview={value.preview} target={target} />}
    />
  );
}

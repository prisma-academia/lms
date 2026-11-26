"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { autocompletion } from "@codemirror/autocomplete";
import { apiPut } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { SiteLivePreview } from "@/components/site-live-preview";
import { SiteVariablePanel } from "@/components/site-variable-panel";
import { SiteFormsPanel } from "@/components/site/site-forms-panel";
import { SiteAiPanel } from "@/components/site/site-ai-panel";
import { useSitePreviewContext } from "@/components/site/use-site-preview-context";
import { siteVariableCompletionFor } from "@/lib/site/variable-completion";
import type { CodeEditorHandle } from "@/components/code-editor";

const CodeEditor = dynamic(
  () => import("@/components/code-editor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-80 animate-pulse rounded-[14px] border-2 border-border bg-muted/40" />
    ),
  }
);

type Layout = { headerHtml: string; footerHtml: string; sharedCss: string };
type Part = "header" | "footer" | "styles";
type Analysis = { removedTagCount: number };
type SaveResponse = { layout: Layout; header: Analysis; footer: Analysis };

const PARTS: { value: Part; label: string }[] = [
  { value: "header", label: "Header" },
  { value: "footer", label: "Footer" },
  { value: "styles", label: "Shared styles" },
];

const FIELD: Record<Part, keyof Layout> = {
  header: "headerHtml",
  footer: "footerHtml",
  styles: "sharedCss",
};

/** A stand-in page for the preview, so the header and footer are seen around something. */
const SAMPLE_PAGE = `<section style="max-width: 60rem; margin: 0 auto; padding: 3.5rem 1.25rem;">
  <h1 style="font-size: 2.25rem; line-height: 1.1;">A sample page</h1>
  <p style="margin-top: 1rem; max-width: 36rem; line-height: 1.6; opacity: .75;">This stands in for whichever page a visitor is on. Your header sits above it and your footer below it, on every page of {{ tenant.name }}.</p>
</section>`;

/**
 * Edit the site's header, footer and shared stylesheet.
 *
 * An empty header or footer means "use the standard one", so clearing a part
 * is how an academy goes back. Nothing is saved until Save, and the preview
 * shows the three parts together around a sample page.
 */
export function LayoutEditor({
  initial,
  defaults,
  canWrite,
  aiConfigured,
}: {
  initial: Layout;
  /** The standard header and footer written out, to start from. */
  defaults: { headerHtml: string; footerHtml: string };
  canWrite: boolean;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const [layout, setLayout] = useState(initial);
  const [savedLayout, setSavedLayout] = useState(initial);
  const [part, setPart] = useState<Part>("header");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<{ header: number; footer: number }>({ header: 0, footer: 0 });
  const [beforeAi, setBeforeAi] = useState<{ part: Part; value: string } | null>(null);
  const [tool, setTool] = useState<"variables" | "forms">("variables");

  const { context } = useSitePreviewContext("PAGE");
  const editorRef = useRef<CodeEditorHandle>(null);
  const completion = useMemo(() => autocompletion({ override: [siteVariableCompletionFor("PAGE")] }), []);

  const field = FIELD[part];
  const value = layout[field];
  const dirty = JSON.stringify(layout) !== JSON.stringify(savedLayout);

  const set = useCallback((next: string, target: Part = part) => {
    setLayout((prev) => ({ ...prev, [FIELD[target]]: next }));
  }, [part]);

  useEffect(() => {
    if (!dirty) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(async () => {
    if (!canWrite || pending) return;
    setPending(true);
    setError(null);
    const res = await apiPut<SaveResponse>("/api/tenant/site/layout", layout);
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data) {
      setSavedLayout(res.data.layout);
      setLayout(res.data.layout);
      setRemoved({ header: res.data.header.removedTagCount, footer: res.data.footer.removedTagCount });
      toast("Header and footer saved. They are live on every page.");
      router.refresh();
    }
  }, [canWrite, pending, layout, toast, router]);

  async function startFromStandard() {
    if (part === "styles") return;
    if (value.trim()) {
      const ok = await confirm({
        title: `Replace your ${part} with the standard one, written out?`,
        description: "What is in the editor is replaced. You can take it back with Undo (Ctrl+Z) in the editor, and nothing is saved until you press Save.",
        confirmLabel: "Replace",
      });
      if (!ok) return;
    }
    set(part === "header" ? defaults.headerHtml : defaults.footerHtml);
  }

  async function clearPart() {
    const ok = await confirm({
      title: part === "styles" ? "Remove your shared styles?" : `Use the standard ${part}?`,
      description:
        part === "styles"
          ? "The editor is emptied. Pages keep their own styles. Nothing is saved until you press Save."
          : `The editor is emptied, which means the built-in ${part} is used. Nothing changes for visitors until you press Save.`,
      confirmLabel: part === "styles" ? "Remove styles" : `Use the standard ${part}`,
    });
    if (ok) set("");
  }

  async function discardChanges() {
    // One press throws away edits to all three parts, and the editor's own
    // undo cannot bring them back once they are replaced.
    const ok = await confirm({
      title: "Discard your unsaved changes?",
      description:
        "Everything you have changed in the header, footer and shared styles since the last save is thrown away. What visitors see is not affected. This cannot be undone.",
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
      destructive: true,
    });
    if (ok) setLayout(savedLayout);
  }

  const removedHere = part === "header" ? removed.header : part === "footer" ? removed.footer : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-3xl text-sm font-medium leading-relaxed text-muted-foreground">
        <p>
          Leave a part empty to use the built-in one. The built-in header shows your logo, your menu,
          and Sign in and Register (or My dashboard, for a learner who is signed in).
        </p>
        <p className="mt-1">
          Whatever you write here, a thin strip with the staff sign-in link and the platform credit
          always stays at the very bottom of the site.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented ariaLabel="Part of the site" options={PARTS} value={part} onChange={setPart} />
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            {part !== "styles" ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void startFromStandard()}>
                Start from the standard one
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" disabled={!value.trim()} onClick={() => void clearPart()}>
              {part === "styles" ? "Remove shared styles" : "Use the standard one"}
            </Button>
          </div>
        ) : null}
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        {part === "styles"
          ? "CSS that applies to every page of the site, as well as each page's own styles. Write plain CSS, without a <style> tag."
          : value.trim()
            ? `You are writing your own ${part}. It replaces the built-in one on every page.`
            : `Empty: the built-in ${part} is in use.`}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <CodeEditor
          // One editor per part, so each keeps its own undo history.
          key={part}
          ref={editorRef}
          value={value}
          onChange={(next) => set(next)}
          onSave={() => void save()}
          extraCompletion={completion}
          readOnly={!canWrite}
          height="26rem"
        />
        {part === "styles" ? (
          <div className="rounded-[14px] border-2 border-border p-3 text-xs leading-relaxed text-muted-foreground">
            <p className="font-bold text-foreground">Good to know</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4">
              <li>
                <code translate="no" className="font-mono">var(--sb-brand)</code> is your brand colour.
              </li>
              <li>Styles are kept inside the page, so they cannot change the menu or the learner area.</li>
              <li>
                <code translate="no" className="font-mono">@import</code> and remote fonts are left out.
              </li>
            </ul>
          </div>
        ) : (
          <div className="flex max-h-[26rem] min-w-0 flex-col gap-3">
            <Segmented
              ariaLabel="Editor tools"
              options={[
                { value: "variables", label: "Variables" },
                { value: "forms", label: "Forms" },
              ]}
              value={tool}
              onChange={setTool}
              className="w-full [&>button]:flex-1"
            />
            <div className="min-h-0 flex-1 overflow-y-auto rounded-[14px] border-2 border-border p-3">
              {tool === "variables" ? (
                <SiteVariablePanel
                  context={context}
                  kind="PAGE"
                  onInsert={canWrite ? (s) => editorRef.current?.insert(s) : undefined}
                />
              ) : (
                <SiteFormsPanel kind="PAGE" onInsert={canWrite ? (s) => editorRef.current?.insert(s) : undefined} />
              )}
            </div>
          </div>
        )}
      </div>

      {removedHere > 0 ? (
        <p role="status" className="max-w-3xl rounded-[10px] border-2 border-warning bg-warning/15 px-3 py-2 text-[13px] font-medium text-foreground">
          {removedHere} element{removedHere === 1 ? " is" : "s are"} left out of your {part} when it is shown.
          Scripts, embedded frames and sign-in or register forms are not allowed here; a search box is.
        </p>
      ) : null}

      {part !== "styles" ? (
        <SiteAiPanel
          target={part}
          kind="PAGE"
          source={value}
          onApply={(html) => {
            setBeforeAi({ part, value });
            set(html);
          }}
          onUndo={
            beforeAi && beforeAi.part === part
              ? () => {
                  set(beforeAi.value, beforeAi.part);
                  setBeforeAi(null);
                }
              : undefined
          }
          canWrite={canWrite}
          aiConfigured={aiConfigured}
        />
      ) : null}

      <div className="flex flex-col gap-2 rounded-[14px] border-2 border-border p-4">
        <h2 className="font-heading text-lg">Preview</h2>
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Your header, a sample page and your footer together, as a visitor gets them. Where a part
          is empty, the standard one written out is shown in its place as a guide.
        </p>
        <SiteLivePreview
          source={SAMPLE_PAGE}
          context={context}
          kind="PAGE"
          header={layout.headerHtml.trim() ? layout.headerHtml : defaults.headerHtml}
          footer={layout.footerHtml.trim() ? layout.footerHtml : defaults.footerHtml}
          sharedCss={layout.sharedCss}
          height={520}
          title="Preview of the header and footer"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      {canWrite ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void save()} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save header and footer"}
          </Button>
          {dirty ? (
            <>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => void discardChanges()}>
                Discard changes
              </Button>
              <span className="text-xs font-bold text-muted-foreground">Unsaved changes</span>
            </>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-medium text-muted-foreground">You can view these but not change them.</p>
      )}
    </div>
  );
}

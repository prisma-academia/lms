"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { autocompletion } from "@codemirror/autocomplete";
import { apiGet, apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { SiteLivePreview, type PreviewDevice } from "@/components/site-live-preview";
import { SiteVariablePanel } from "@/components/site-variable-panel";
import { siteVariableCompletion } from "@/lib/site/variable-completion";
import { sampleContext } from "@/lib/site/variables";
import { SNIPPETS } from "@/lib/site/html-sections";
import type { VariableContext } from "@/lib/site/template";
import type { CodeEditorHandle } from "@/components/code-editor";
import type { SitePageRow } from "@/lib/site/pages";
import { cn } from "@/lib/utils";

const CodeEditor = dynamic(
  () => import("@/components/code-editor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => <div className="h-full animate-pulse bg-muted/40" />,
  }
);

type Layout = "split" | "editor" | "preview";
type Rail = "variables" | "snippets" | null;

const DEVICES: { id: PreviewDevice; icon: "monitor" | "tablet" | "smartphone"; label: string }[] = [
  { id: "desktop", icon: "monitor", label: "Desktop" },
  { id: "tablet", icon: "tablet", label: "Tablet" },
  { id: "mobile", icon: "smartphone", label: "Mobile" },
];

export function SitePlayground({
  page,
  canWrite,
}: {
  page: SitePageRow;
  canWrite: boolean;
}) {
  const router = useRouter();

  const [source, setSource] = useState(page.htmlSource);
  const [savedSource, setSavedSource] = useState(page.htmlSource);
  const [status, setStatus] = useState(page.status);
  const [layout, setLayout] = useState<Layout>("split");
  const [rail, setRail] = useState<Rail>("variables");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [ctx, setCtx] = useState<VariableContext | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editorRef = useRef<CodeEditorHandle>(null);
  const dirty = source !== savedSource;

  useEffect(() => {
    let cancelled = false;
    apiGet<{ context: VariableContext }>("/api/tenant/site/preview-context").then((res) => {
      if (cancelled) return;
      setCtx(res.data?.context ?? (sampleContext() as VariableContext));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const completion = useMemo(
    () => autocompletion({ override: [siteVariableCompletion] }),
    []
  );

  const save = useCallback(async () => {
    if (!canWrite || pending) return;
    setPending(true);
    setError(null);
    setMessage(null);

    const res = await apiPatch<{ page: SitePageRow; removedTagCount?: number }>(
      `/api/tenant/site/pages/${page.id}`,
      { htmlSource: source, status }
    );

    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.page) {
      setSavedSource(res.data.page.htmlSource);
      setMessage(
        res.data.removedTagCount
          ? `Saved — ${res.data.removedTagCount} disallowed element${res.data.removedTagCount === 1 ? "" : "s"} will be stripped on render.`
          : "Saved."
      );
      router.refresh();
    }
  }, [canWrite, pending, page.id, source, status, router]);

  const exit = useCallback(() => {
    if (dirty && !confirm("You have unsaved changes. Leave the playground?")) return;
    router.push(`/admin/site/pages/${page.id}`);
  }, [dirty, router, page.id]);

  // Esc exits, but not while a completion popup or a dialog is open — CodeMirror
  // handles Esc itself in those cases, and stealing it would make dismissing the
  // autocomplete list navigate away from the page instead.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".cm-tooltip-autocomplete")) return;
      exit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit]);

  // Mod+S is bound inside the editor too; this catches it when focus is on the
  // rail, the toolbar, or the preview.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function insert(text: string) {
    editorRef.current?.insert(text);
    if (layout === "preview") setLayout("split");
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* Top bar. */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b-2 border-border px-3 py-2">
        <Button type="button" size="sm" variant="ghost" onClick={exit}>
          <Icon name="arrow-left" />
          Exit
        </Button>

        <div className="min-w-0">
          <span className="truncate font-heading text-sm">{page.title}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {page.isHome ? "/" : `/${page.slug}`}
            {dirty ? " · unsaved" : ""}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <RailToggle rail={rail} setRail={setRail} />

          <span className="mx-1 h-5 w-px bg-border" />

          <LayoutToggle layout={layout} setLayout={setLayout} />

          <span className="mx-1 h-5 w-px bg-border" />

          {DEVICES.map((d) => (
            <Button
              key={d.id}
              type="button"
              size="sm"
              variant={device === d.id ? "default" : "ghost"}
              onClick={() => setDevice(d.id)}
              title={d.label}
              aria-label={d.label}
              aria-pressed={device === d.id}
            >
              <Icon name={d.icon} />
            </Button>
          ))}

          <span className="mx-1 h-5 w-px bg-border" />

          {canWrite ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setStatus(status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}
                title="Saved with the next save"
              >
                {status === "PUBLISHED" ? "Published" : "Draft"}
              </Button>
              <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Read only</span>
          )}
        </div>
      </header>

      {(error || message) && (
        <div
          className={cn(
            "shrink-0 border-b-2 border-border px-3 py-1.5 text-xs",
            error ? "text-red-600" : "text-green-700"
          )}
        >
          {error ?? message}
        </div>
      )}

      {/* Body. */}
      <div className="flex min-h-0 flex-1">
        {rail ? (
          <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-r-2 border-border p-3 lg:flex">
            {rail === "variables" ? (
              <SiteVariablePanel
                context={ctx}
                onInsert={canWrite ? insert : undefined}
                className="min-h-0"
              />
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Click to insert at the cursor. Start with “Base styles” — the other
                  snippets use its classes.
                </p>
                {SNIPPETS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!canWrite}
                    onClick={() => insert(`${s.html}\n\n`)}
                    className="rounded-[10px] border-2 border-border p-2 text-left transition hover:bg-muted/50 disabled:opacity-50"
                  >
                    <span className="block text-sm font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.description}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        ) : null}

        <main className="flex min-h-0 min-w-0 flex-1">
          {layout !== "preview" ? (
            <div className={cn("min-w-0", layout === "split" ? "w-1/2" : "flex-1")}>
              <CodeEditor
                ref={editorRef}
                value={source}
                onChange={setSource}
                onSave={save}
                extraCompletion={completion}
                readOnly={!canWrite}
                height="100%"
                className="h-full rounded-none border-0 border-r-2"
              />
            </div>
          ) : null}

          {layout !== "editor" ? (
            <div
              className={cn(
                "min-w-0 overflow-auto bg-muted/20 p-3",
                layout === "split" ? "w-1/2" : "flex-1"
              )}
            >
              <SiteLivePreview
                source={source}
                context={ctx}
                device={device}
                height={10000}
                className="h-full border-0 bg-transparent p-0"
              />
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function RailToggle({ rail, setRail }: { rail: Rail; setRail: (r: Rail) => void }) {
  return (
    <div className="hidden gap-1 lg:flex">
      <Button
        type="button"
        size="sm"
        variant={rail === "variables" ? "default" : "ghost"}
        onClick={() => setRail(rail === "variables" ? null : "variables")}
        aria-pressed={rail === "variables"}
      >
        <Icon name="code" />
        Variables
      </Button>
      <Button
        type="button"
        size="sm"
        variant={rail === "snippets" ? "default" : "ghost"}
        onClick={() => setRail(rail === "snippets" ? null : "snippets")}
        aria-pressed={rail === "snippets"}
      >
        <Icon name="plus" />
        Snippets
      </Button>
    </div>
  );
}

function LayoutToggle({
  layout,
  setLayout,
}: {
  layout: Layout;
  setLayout: (l: Layout) => void;
}) {
  const options: { id: Layout; label: string }[] = [
    { id: "editor", label: "Code" },
    { id: "split", label: "Split" },
    { id: "preview", label: "Preview" },
  ];
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <Button
          key={o.id}
          type="button"
          size="sm"
          variant={layout === o.id ? "default" : "ghost"}
          onClick={() => setLayout(o.id)}
          aria-pressed={layout === o.id}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { autocompletion } from "@codemirror/autocomplete";
import { apiPatch } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Icon } from "@/components/icon";
import { SiteLivePreview, type PreviewDevice } from "@/components/site-live-preview";
import { SiteVariablePanel } from "@/components/site-variable-panel";
import { SiteFormsPanel } from "@/components/site/site-forms-panel";
import { SectionOutline } from "@/components/site/section-outline";
import { PublishChecklist } from "@/components/site/publish-checklist";
import { SiteAiPanel } from "@/components/site/site-ai-panel";
import { useSitePreviewContext } from "@/components/site/use-site-preview-context";
import { siteVariableCompletionFor } from "@/lib/site/variable-completion";
import { analyzeSource } from "@/lib/site/source";
import { findPageKind } from "@/lib/site/site-api";
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
type Rail = "variables" | "forms" | "sections" | "ai" | null;

const DEVICES: { id: PreviewDevice; icon: "monitor" | "tablet" | "smartphone"; label: string }[] = [
  { id: "desktop", icon: "monitor", label: "Desktop" },
  { id: "tablet", icon: "tablet", label: "Tablet" },
  { id: "mobile", icon: "smartphone", label: "Mobile" },
];

const RAILS: { id: Exclude<Rail, null>; label: string }[] = [
  { id: "variables", label: "Variables" },
  { id: "forms", label: "Forms" },
  { id: "sections", label: "Sections" },
  { id: "ai", label: "AI" },
];

export function SitePlayground({
  page,
  canWrite,
  aiConfigured,
}: {
  page: SitePageRow;
  canWrite: boolean;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const kindDef = findPageKind(page.kind);
  const kind = kindDef.kind;
  const special = kind !== "PAGE";

  const [source, setSource] = useState(page.htmlSource);
  const [savedSource, setSavedSource] = useState(page.htmlSource);
  const [status, setStatus] = useState(page.status);
  const [savedStatus, setSavedStatus] = useState(page.status);
  const [layout, setLayout] = useState<Layout>("split");
  const [rail, setRail] = useState<Rail>("variables");
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [beforeAi, setBeforeAi] = useState<string | null>(null);

  const { context } = useSitePreviewContext(kind);
  const editorRef = useRef<CodeEditorHandle>(null);
  const dirty = source !== savedSource || status !== savedStatus;

  const completion = useMemo(
    () => autocompletion({ override: [siteVariableCompletionFor(kind)] }),
    [kind]
  );

  // The server's own publish check, run as you type.
  const deferred = useDeferredValue(source);
  const problems = useMemo(() => analyzeSource(deferred, "check", kind).problems, [deferred, kind]);
  const blocked = special && status === "PUBLISHED" && problems.length > 0;

  const save = useCallback(async () => {
    if (!canWrite || pending || blocked) return;
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
      setSavedStatus(res.data.page.status);
      const n = res.data.removedTagCount ?? 0;
      setMessage(
        n > 0
          ? `Saved. ${n} element${n === 1 ? " is" : "s are"} left out when the page is shown (scripts, frames, forms the platform does not run).`
          : res.data.page.status === "PUBLISHED"
            ? "Saved and published."
            : "Saved as a draft."
      );
      router.refresh();
    }
  }, [canWrite, pending, blocked, page.id, source, status, router]);

  const exit = useCallback(async () => {
    if (dirty) {
      const ok = await confirm({
        title: "Leave without saving?",
        description: "Your changes to this page have not been saved and will be lost.",
        confirmLabel: "Leave without saving",
        cancelLabel: "Keep editing",
        destructive: true,
      });
      if (!ok) return;
    }
    router.push(`/admin/site/pages/${page.id}`);
  }, [dirty, confirm, router, page.id]);

  // Esc exits, but not while a completion popup or a dialog is open — CodeMirror
  // handles Esc itself in those cases, and stealing it would make dismissing the
  // autocomplete list navigate away from the page instead.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (document.querySelector(".cm-tooltip-autocomplete, [role='dialog'], [role='alertdialog']")) return;
      void exit();
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
        <Button type="button" size="sm" variant="ghost" onClick={() => void exit()}>
          <Icon name="arrow-left" aria-hidden />
          Exit
        </Button>

        <div className="min-w-0">
          <h1 className="inline truncate font-heading text-sm">{page.title}</h1>
          <span className="ml-2 text-xs text-muted-foreground">
            <code translate="no" className="font-mono">
              {special ? kindDef.path : page.isHome ? "/" : `/${page.slug}`}
            </code>
            {dirty ? " · unsaved" : ""}
          </span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          <div className="hidden gap-1 lg:flex" role="group" aria-label="Side panel">
            {RAILS.map((r) => (
              <Button
                key={r.id}
                type="button"
                size="sm"
                variant={rail === r.id ? "default" : "ghost"}
                onClick={() => setRail(rail === r.id ? null : r.id)}
                aria-pressed={rail === r.id}
              >
                {r.label}
              </Button>
            ))}
          </div>

          <span className="mx-1 hidden h-5 w-px bg-border lg:block" aria-hidden />

          <LayoutToggle layout={layout} setLayout={setLayout} />

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />

          <div className="flex gap-1" role="group" aria-label="Preview width">
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
                <Icon name={d.icon} aria-hidden />
              </Button>
            ))}
          </div>

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />

          {canWrite ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setStatus(status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}
                aria-pressed={status === "PUBLISHED"}
                title="Takes effect when you save"
              >
                {status === "PUBLISHED" ? "Published" : "Draft"}
              </Button>
              <Button type="button" size="sm" onClick={() => void save()} disabled={pending || !dirty || blocked}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Read only</span>
          )}
        </div>
      </header>

      {error || message ? (
        <div
          role={error ? "alert" : "status"}
          className={cn(
            "shrink-0 border-b-2 border-border px-3 py-1.5 text-xs font-bold",
            error ? "text-destructive" : "text-foreground"
          )}
        >
          {error ?? message}
        </div>
      ) : null}

      {blocked ? (
        <PublishChecklist kind={kind} problems={problems} className="m-2 shrink-0" />
      ) : null}

      {/* Body. */}
      <div className="flex min-h-0 flex-1">
        {rail ? (
          <aside
            aria-label={RAILS.find((r) => r.id === rail)?.label}
            className={cn(
              "hidden shrink-0 flex-col gap-3 overflow-y-auto border-r-2 border-border p-3 lg:flex",
              rail === "ai" ? "w-[26rem]" : "w-80"
            )}
          >
            {rail === "variables" ? (
              <SiteVariablePanel context={context} kind={kind} onInsert={canWrite ? insert : undefined} className="min-h-0" />
            ) : rail === "forms" ? (
              <SiteFormsPanel kind={kind} onInsert={canWrite ? insert : undefined} />
            ) : rail === "sections" ? (
              <SectionOutline source={source} onChange={setSource} canWrite={canWrite} />
            ) : (
              <SiteAiPanel
                target="page"
                kind={kind}
                pageId={page.id}
                pageTitle={page.title}
                source={source}
                onApply={(html) => {
                  setBeforeAi(source);
                  setSource(html);
                }}
                onUndo={
                  beforeAi !== null
                    ? () => {
                        setSource(beforeAi);
                        setBeforeAi(null);
                      }
                    : undefined
                }
                canWrite={canWrite}
                aiConfigured={aiConfigured}
              />
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
                onSave={() => void save()}
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
                context={context}
                kind={kind}
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
    <div className="flex gap-1" role="group" aria-label="Layout">
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

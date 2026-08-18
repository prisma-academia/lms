"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { autocompletion } from "@codemirror/autocomplete";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { PreviewFrame } from "@/components/preview-frame";
import { SiteLivePreview } from "@/components/site-live-preview";
import { SiteVariablePanel } from "@/components/site-variable-panel";
import { siteVariableCompletion } from "@/lib/site/variable-completion";
import { sampleContext } from "@/lib/site/variables";
import type { VariableContext } from "@/lib/site/template";
import type { CodeEditorHandle } from "@/components/code-editor";
import type { SitePageRow } from "@/lib/site/pages";

// CodeMirror constructs against a real DOM and has no business in a server
// bundle. `ssr: false` is what keeps ~200KB of editor off the tenant landing
// page's dependency graph.
const CodeEditor = dynamic(
  () => import("@/components/code-editor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 animate-pulse rounded-[14px] border-2 border-border bg-muted/40" />
    ),
  }
);

type SaveResponse = {
  page: SitePageRow;
  removedTagCount?: number;
  headTitle?: string | null;
};

export function SitePageEditor({
  page,
  canWrite,
  templates,
}: {
  page: SitePageRow | null;
  canWrite: boolean;
  templates: { id: string; name: string; description: string }[];
}) {
  const router = useRouter();
  const isNew = !page;
  const isHome = page?.isHome ?? false;

  const [title, setTitle] = useState(page?.title ?? "New page");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">(page?.status ?? "DRAFT");
  const [showInNav, setShowInNav] = useState(page?.showInNav ?? true);
  const [navOrder, setNavOrder] = useState(String(page?.navOrder ?? 0));
  const [seoTitle, setSeoTitle] = useState(page?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(page?.seoDescription ?? "");
  const [htmlSource, setHtmlSource] = useState(page?.htmlSource ?? "");
  const [includeShell, setIncludeShell] = useState(page?.includeShell ?? true);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "classic");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  // Live preview until a save happens, then the authoritative server render.
  // `previewVersion` both forces the iframe to reload and marks the point after
  // which "saved" is true — see the note on the preview toggle below.
  const [previewVersion, setPreviewVersion] = useState(0);
  const [savedSource, setSavedSource] = useState(page?.htmlSource ?? "");
  const [previewMode, setPreviewMode] = useState<"live" | "saved">("live");

  const [ctx, setCtx] = useState<VariableContext | null>(null);
  const editorRef = useRef<CodeEditorHandle>(null);

  const dirty = htmlSource !== savedSource;

  useEffect(() => {
    let cancelled = false;
    apiGet<{ context: VariableContext }>("/api/tenant/site/preview-context").then((res) => {
      if (cancelled) return;
      // Sample values keep the preview usable if the request fails — a preview
      // with placeholder data beats a blank one.
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

  const templateOptions = useMemo(
    () => templates.map((t) => ({ value: t.id, label: t.name })),
    [templates]
  );

  const save = useCallback(async () => {
    if (!canWrite) return;
    setError(null);
    setInfo(null);
    setWarning(null);
    setPending(true);

    const common = {
      title: title.trim(),
      status,
      showInNav,
      navOrder: parseInt(navOrder, 10) || 0,
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      htmlSource,
      includeShell,
    };

    const res = isNew
      ? await apiPost<SaveResponse>("/api/tenant/site/pages", {
          ...common,
          slug: slug.trim() || undefined,
          templateId: htmlSource.trim() ? undefined : templateId,
        })
      : await apiPatch<SaveResponse>(`/api/tenant/site/pages/${page!.id}`, {
          ...common,
          ...(isHome ? {} : { slug: slug.trim() }),
        });

    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }

    if (isNew && res.data?.page) {
      router.push(`/admin/site/pages/${res.data.page.id}`);
      return;
    }

    if (res.data?.page) {
      setHtmlSource(res.data.page.htmlSource);
      setSavedSource(res.data.page.htmlSource);
      setInfo("Saved.");
      setPreviewVersion((v) => v + 1);
      setPreviewMode("saved");
      if (res.data.removedTagCount) {
        setWarning(
          `${res.data.removedTagCount} element${res.data.removedTagCount === 1 ? "" : "s"} ` +
            "will be removed when this page renders — scripts, iframes, and forms are not allowed."
        );
      }
      router.refresh();
    }
  }, [
    canWrite, title, status, showInNav, navOrder, seoTitle, seoDescription,
    htmlSource, includeShell, isNew, slug, templateId, page, isHome, router,
  ]);

  async function applyTemplate() {
    if (!page || !canWrite) return;
    if (!confirm("Replace the entire page with this template? Your current HTML will be lost.")) {
      return;
    }
    setPending(true);
    const res = await apiPatch<SaveResponse>(`/api/tenant/site/pages/${page.id}`, {
      applyTemplateId: templateId,
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.page) {
      setHtmlSource(res.data.page.htmlSource);
      setSavedSource(res.data.page.htmlSource);
      setInfo("Template applied.");
    }
  }

  async function onDelete() {
    if (!page || page.isHome) return;
    if (!confirm("Delete this page?")) return;
    const res = await apiDelete(`/api/tenant/site/pages/${page.id}`);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    router.push("/admin/site/pages");
  }

  async function saveAsTemplate() {
    if (!canWrite) return;
    const name = prompt("Template name?");
    if (!name?.trim()) return;
    const res = await apiPost("/api/tenant/templates", {
      type: "site_page",
      name: name.trim(),
      contentJson: { htmlSource },
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setInfo("Saved as site_page template.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="sp-title">
          <TextInput
            id="sp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField
          label="Slug"
          htmlFor="sp-slug"
          hint={isHome ? "Home page uses /" : "Public URL path"}
        >
          <TextInput
            id="sp-slug"
            value={isHome ? "" : slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!canWrite || isHome}
            placeholder={isHome ? "(home)" : "about"}
          />
        </FormField>
      </div>

      <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
        <FormField label="Status" htmlFor="sp-status">
          <SelectInput
            id="sp-status"
            allowEmpty={false}
            options={[
              { value: "DRAFT", label: "Draft" },
              { value: "PUBLISHED", label: "Published" },
            ]}
            value={status}
            onChange={(e) => setStatus(e.target.value as "DRAFT" | "PUBLISHED")}
            disabled={!canWrite}
          />
        </FormField>
        <FormField label="Nav order" htmlFor="sp-nav">
          <TextInput
            id="sp-nav"
            value={navOrder}
            onChange={(e) => setNavOrder(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField label="Show in nav" htmlFor="sp-shownav">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input
              id="sp-shownav"
              type="checkbox"
              checked={showInNav}
              onChange={(e) => setShowInNav(e.target.checked)}
              disabled={!canWrite || isHome}
            />
            Visible in header
          </label>
        </FormField>
      </div>

      {/* The page document. */}
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg">Page HTML</h2>
            <p className="text-xs text-muted-foreground">
              Write standard HTML. Type <code className="font-mono">{"{{"}</code> to insert a
              variable, or <code className="font-mono">&lt;</code> for tag completion.
              Scripts, iframes and forms are removed when the page renders.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowVariables((v) => !v)}
              aria-expanded={showVariables}
            >
              <Icon name="code" />
              {showVariables ? "Hide variables" : "Variables"}
            </Button>
            {!isNew ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={`/admin/site-playground/${page!.id}`}>
                  <Icon name="maximize" />
                  Immersive playground
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className={showVariables ? "grid gap-4 lg:grid-cols-[1fr_18rem]" : ""}>
          <CodeEditor
            ref={editorRef}
            value={htmlSource}
            onChange={setHtmlSource}
            onSave={save}
            extraCompletion={completion}
            readOnly={!canWrite}
            height="30rem"
          />
          {showVariables ? (
            <SiteVariablePanel
              context={ctx}
              onInsert={canWrite ? (s) => editorRef.current?.insert(s) : undefined}
              className="max-h-[30rem] rounded-[14px] border-2 border-border p-3"
            />
          ) : null}
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeShell}
            onChange={(e) => setIncludeShell(e.target.checked)}
            disabled={!canWrite}
          />
          Wrap in the site header and footer
        </label>
      </div>

      {/* Preview. */}
      <div className="flex flex-col gap-3 rounded-[14px] border-2 border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg">Preview</h2>
            <p className="text-xs text-muted-foreground">
              {previewMode === "live"
                ? "Updates as you type. Shows your HTML as written — the header, footer and content filtering are applied when you save."
                : "The saved page exactly as a visitor receives it, drafts included."}
            </p>
          </div>
          {!isNew ? (
            <div className="flex gap-1">
              <Button
                type="button"
                size="sm"
                variant={previewMode === "live" ? "default" : "outline"}
                onClick={() => setPreviewMode("live")}
              >
                Live
              </Button>
              <Button
                type="button"
                size="sm"
                variant={previewMode === "saved" ? "default" : "outline"}
                onClick={() => setPreviewMode("saved")}
              >
                Saved
                {dirty ? " *" : ""}
              </Button>
            </div>
          ) : null}
        </div>

        {previewMode === "saved" && !isNew ? (
          <>
            {dirty ? (
              <p className="text-xs text-amber-700">
                You have unsaved changes. This shows the last saved version.
              </p>
            ) : null}
            <PreviewFrame
              src={`/admin/preview/site/${page!.id}`}
              title={`Preview of ${title}`}
              refreshToken={previewVersion}
              height={640}
            />
          </>
        ) : (
          <SiteLivePreview source={htmlSource} context={ctx} height={640} />
        )}
      </div>

      {/* SEO. */}
      <div className="grid max-w-3xl gap-4">
        <FormField
          label="SEO title"
          htmlFor="sp-seo-title"
          hint="Falls back to the document's own <title>, then the page title."
        >
          <TextInput
            id="sp-seo-title"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField label="SEO description" htmlFor="sp-seo-desc">
          <TextArea
            id="sp-seo-desc"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
      </div>

      {canWrite ? (
        <div className="flex max-w-3xl flex-wrap items-end gap-3 rounded-[14px] border-2 border-border p-4">
          <FormField label="Starter template" htmlFor="sp-tpl">
            <SelectInput
              id="sp-tpl"
              allowEmpty={false}
              options={templateOptions}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            />
          </FormField>
          {isNew ? (
            <p className="text-xs text-muted-foreground">
              Applied on create if you leave the editor empty.
            </p>
          ) : (
            <Button type="button" variant="outline" onClick={applyTemplate} disabled={pending}>
              Replace page with template
            </Button>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {warning ? <p className="text-sm text-amber-700">{warning}</p> : null}
      {info ? <p className="text-sm text-green-700">{info}</p> : null}

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : isNew ? "Create page" : "Save"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="outline" onClick={saveAsTemplate}>
              Save as template
            </Button>
          ) : null}
          {!isNew && !isHome ? (
            <Button type="button" variant="outline" onClick={onDelete}>
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

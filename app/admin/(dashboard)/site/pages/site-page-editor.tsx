"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { autocompletion } from "@codemirror/autocomplete";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { PreviewFrame } from "@/components/preview-frame";
import { SiteLivePreview } from "@/components/site-live-preview";
import { SiteVariablePanel } from "@/components/site-variable-panel";
import { SiteImagePanel } from "@/components/site-image-panel";
import { SiteFormsPanel } from "@/components/site/site-forms-panel";
import { SectionOutline } from "@/components/site/section-outline";
import { PublishChecklist } from "@/components/site/publish-checklist";
import { SiteAiPanel } from "@/components/site/site-ai-panel";
import { TemplateGallery, type TemplateChoice } from "@/components/site/template-gallery";
import { useSitePreviewContext } from "@/components/site/use-site-preview-context";
import { uploadViaPresign } from "@/lib/client/upload";
import { siteVariableCompletionFor } from "@/lib/site/variable-completion";
import { analyzeSource } from "@/lib/site/source";
import { findPageKind } from "@/lib/site/site-api";
import type { SavedSiteTemplate } from "@/lib/site/saved-templates";
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
  problems?: string[];
};

type Tool = "variables" | "forms" | "sections" | "images";

const TOOLS: { value: Tool; label: string }[] = [
  { value: "variables", label: "Variables" },
  { value: "forms", label: "Forms" },
  { value: "sections", label: "Sections" },
  { value: "images", label: "Images" },
];

/**
 * The editor for one existing site page: its settings, its HTML, and the tools
 * around it (variables, the platform's forms, sections, designs, AI).
 *
 * Nothing here changes the page until Save. Tools that rewrite the document —
 * a new design, a moved section, an AI result — put their result in the code
 * editor as one change, so Ctrl+Z there takes it back.
 */
export function SitePageEditor({
  page,
  canWrite,
  initialOgImageUrl,
  aiConfigured,
  saved: initialSaved,
}: {
  page: SitePageRow;
  canWrite: boolean;
  /**
   * Resolved server-side: turning a stored key into a public URL needs the S3
   * config, which is not available in the browser.
   */
  initialOgImageUrl?: string | null;
  aiConfigured: boolean;
  /** The academy's saved page designs. */
  saved: SavedSiteTemplate[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const isHome = page.isHome;
  const kindDef = findPageKind(page.kind);
  const kind = kindDef.kind;
  const special = kind !== "PAGE";

  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">(page.status);
  const [showInNav, setShowInNav] = useState(page.showInNav);
  const [navOrder, setNavOrder] = useState(String(page.navOrder));
  const [seoTitle, setSeoTitle] = useState(page.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(page.seoDescription ?? "");
  const [ogImageKey, setOgImageKey] = useState<string | null>(page.ogImageKey);
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(initialOgImageUrl ?? null);
  const [ogUploading, setOgUploading] = useState(false);
  const [htmlSource, setHtmlSource] = useState(page.htmlSource);
  const [includeShell, setIncludeShell] = useState(page.includeShell);

  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tool, setTool] = useState<Tool>("variables");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [templateName, setTemplateName] = useState<string | null>(null);
  const [beforeAi, setBeforeAi] = useState<string | null>(null);

  // Live preview until a save happens, then the authoritative server render.
  const [previewVersion, setPreviewVersion] = useState(0);
  const [previewMode, setPreviewMode] = useState<"live" | "saved">("live");

  /** Everything as last saved, to know whether there is anything to lose. */
  const snapshot = JSON.stringify([
    title, slug, status, showInNav, navOrder, seoTitle, seoDescription, ogImageKey, htmlSource, includeShell,
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const [savedSource, setSavedSource] = useState(page.htmlSource);
  const dirty = snapshot !== savedSnapshot;
  const sourceDirty = htmlSource !== savedSource;

  const { context, sampled } = useSitePreviewContext(kind);
  const editorRef = useRef<CodeEditorHandle>(null);

  const completion = useMemo(
    () => autocompletion({ override: [siteVariableCompletionFor(kind)] }),
    [kind]
  );

  // The same check the server makes before it will publish, run as you type so
  // the answer is on screen before the button is pressed.
  const deferredSource = useDeferredValue(htmlSource);
  const analysis = useMemo(() => analyzeSource(deferredSource, "check", kind), [deferredSource, kind]);
  const blocked = special && status === "PUBLISHED" && analysis.problems.length > 0;

  useEffect(() => {
    if (!dirty) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useCallback(
    async (overrides?: { status?: "DRAFT" | "PUBLISHED" }) => {
      if (!canWrite || pending) return;
      const nextStatus = overrides?.status ?? status;
      setError(null);
      setWarning(null);
      setPending(true);

      const res = await apiPatch<SaveResponse>(`/api/tenant/site/pages/${page.id}`, {
        title: title.trim(),
        status: nextStatus,
        ...(special ? {} : { showInNav, navOrder: parseInt(navOrder, 10) || 0 }),
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        // Always sent, including null, so removing the image actually removes it.
        ogImageKey,
        htmlSource,
        includeShell,
        ...(isHome || special ? {} : { slug: slug.trim() }),
      });

      setPending(false);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      if (!res.data?.page) return;

      const p = res.data.page;
      setStatus(p.status);
      setSlug(p.slug);
      setSavedSource(p.htmlSource);
      setSavedSnapshot(
        JSON.stringify([
          title, p.slug, p.status, showInNav, navOrder, seoTitle, seoDescription, ogImageKey, htmlSource, includeShell,
        ])
      );
      setPreviewVersion((v) => v + 1);
      setPreviewMode("saved");
      toast(p.status === "PUBLISHED" ? "Saved and published." : "Saved as a draft.");
      if (res.data.removedTagCount) {
        const n = res.data.removedTagCount;
        setWarning(
          `${n} element${n === 1 ? " is" : "s are"} left out when this page is shown. Scripts, embedded frames and forms the platform does not run are not allowed. The Live preview shows the page without them.`
        );
      }
      router.refresh();
    },
    [
      canWrite, pending, status, page.id, title, special, showInNav, navOrder, seoTitle,
      seoDescription, ogImageKey, htmlSource, includeShell, isHome, slug, toast, router,
    ]
  );

  function insert(text: string) {
    editorRef.current?.insert(text);
  }

  async function chooseDesign(choice: TemplateChoice) {
    if (htmlSource.trim()) {
      const ok = await confirm({
        title: `Replace this page with “${choice.name}”?`,
        description:
          "Everything in the editor is replaced by the design. You can take it back with Undo (Ctrl+Z) in the editor, and nothing is saved until you press Save.",
        confirmLabel: "Replace content",
      });
      if (!ok) return;
    }
    setHtmlSource(choice.html);
    setGalleryOpen(false);
    setPreviewMode("live");
    toast(`“${choice.name}” is in the editor. Save to keep it.`);
  }

  async function deleteSaved(choice: TemplateChoice) {
    if (!choice.savedId) return;
    const ok = await confirm({
      title: `Delete the saved design “${choice.name}”?`,
      description: "It is removed from your gallery. Pages already made from it are not changed. This cannot be undone.",
      confirmLabel: "Delete design",
      destructive: true,
    });
    if (!ok) return;
    const res = await apiDelete(`/api/tenant/site/templates/${choice.savedId}`);
    if (res.error) return setError(res.error.message);
    setSaved((prev) => prev.filter((s) => s.id !== choice.savedId));
    toast("Saved design deleted.");
  }

  async function saveAsTemplate() {
    const name = templateName?.trim();
    if (!name) return;
    const res = await apiPost<{ template: SavedSiteTemplate }>("/api/tenant/site/templates", {
      name,
      kind,
      htmlSource,
    });
    if (res.error) return setError(res.error.message);
    if (res.data?.template) setSaved((prev) => [res.data!.template, ...prev]);
    setTemplateName(null);
    toast(`Saved “${name}” to your designs.`);
  }

  async function onDelete() {
    const ok = await confirm({
      title: special ? `Delete your ${kindDef.label.toLowerCase()} design?` : "Delete this page?",
      description: special
        ? `“${title}” is deleted and visitors see the standard screen at ${kindDef.path} again. This cannot be undone.`
        : `“${title}” is removed from your site. This cannot be undone.`,
      confirmLabel: special ? "Delete design" : "Delete page",
      destructive: true,
    });
    if (!ok) return;
    const res = await apiDelete(`/api/tenant/site/pages/${page.id}`);
    if (res.error) return setError(res.error.message);
    setSavedSnapshot(snapshot);
    router.push("/admin/site/pages");
  }

  const publicPath = special ? kindDef.path : isHome ? "/" : `/${slug}`;
  const sampleNote =
    kind === "COURSE_DETAIL"
      ? sampled.includes("course")
        ? "This design is used for every course. The preview shows made-up sample values, because there is no public course yet."
        : "This design is used for every course. The preview shows your first public course as an example."
      : kind === "PROGRAMME_DETAIL"
        ? sampled.includes("programme")
          ? "This design is used for every programme. The preview shows made-up sample values, because there is no public programme yet."
          : "This design is used for every programme. The preview shows your first public programme as an example."
        : null;

  return (
    <div className="flex flex-col gap-6">
      {special ? (
        <div className="rounded-[12px] border-2 border-border bg-muted p-3 text-sm">
          <p className="font-bold text-foreground">{kindDef.label}</p>
          <p className="mt-1 text-[13px] font-medium leading-relaxed text-muted-foreground">
            {kindDef.purpose} Visitors see it at{" "}
            <code translate="no" className="font-mono text-foreground">
              {kindDef.path}
            </code>{" "}
            once it is published.
          </p>
        </div>
      ) : null}

      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="sp-title">
          <TextInput
            id="sp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canWrite}
            autoComplete="off"
          />
        </FormField>
        {special ? null : (
          <FormField
            label="Address"
            htmlFor="sp-slug"
            hint={isHome ? "The home page is always at /" : `Visitors see this page at /${slug || "…"}`}
          >
            <TextInput
              id="sp-slug"
              value={isHome ? "" : slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={!canWrite || isHome}
              placeholder={isHome ? "(home)" : "about…"}
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>
        )}
      </div>

      <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
        <FormField
          label="Status"
          htmlFor="sp-status"
          hint={special ? "Published replaces the standard screen." : "Only published pages are visible."}
        >
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
        {special ? null : (
          <>
            <FormField label="Menu position" htmlFor="sp-nav" hint="Lower numbers come first.">
              <TextInput
                id="sp-nav"
                type="number"
                inputMode="numeric"
                min="0"
                value={navOrder}
                onChange={(e) => setNavOrder(e.target.value)}
                disabled={!canWrite}
              />
            </FormField>
            <div className="flex items-end pb-2">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={showInNav}
                  onChange={(e) => setShowInNav(e.target.checked)}
                  disabled={!canWrite || isHome}
                />
                Show in the site menu
              </label>
            </div>
          </>
        )}
      </div>

      <PublishChecklist kind={kind} problems={analysis.problems} className="max-w-3xl" />

      {/* The page document. */}
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg">Page HTML</h2>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Write standard HTML. Type <code className="font-mono">{"{{"}</code> for a variable.
              Scripts and embedded frames are left out when the page is shown; forms work when they
              are one of the platform&rsquo;s (see Forms).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setGalleryOpen(true)}>
                <Icon name="palette" aria-hidden />
                Change design
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" asChild>
              <a href={`/admin/site-playground/${page.id}`}>
                <Icon name="maximize" aria-hidden />
                Full-screen editor
              </a>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <CodeEditor
            ref={editorRef}
            value={htmlSource}
            onChange={setHtmlSource}
            onSave={() => void save()}
            extraCompletion={completion}
            readOnly={!canWrite}
            height="34rem"
          />
          <div className="flex max-h-[34rem] min-w-0 flex-col gap-3">
            <Segmented
              ariaLabel="Editor tools"
              options={TOOLS}
              value={tool}
              onChange={setTool}
              className="w-full [&>button]:flex-1 [&>button]:px-2"
            />
            <div className="min-h-0 flex-1 overflow-y-auto rounded-[14px] border-2 border-border p-3">
              {tool === "variables" ? (
                <SiteVariablePanel context={context} kind={kind} onInsert={canWrite ? insert : undefined} />
              ) : tool === "forms" ? (
                <SiteFormsPanel kind={kind} onInsert={canWrite ? insert : undefined} />
              ) : tool === "sections" ? (
                <SectionOutline source={htmlSource} onChange={setHtmlSource} canWrite={canWrite} />
              ) : (
                <SiteImagePanel onInsert={canWrite ? insert : undefined} />
              )}
            </div>
          </div>
        </div>

        <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={includeShell}
            onChange={(e) => setIncludeShell(e.target.checked)}
            disabled={!canWrite}
          />
          Show the site header and footer around this page
        </label>
      </div>

      <SiteAiPanel
        target="page"
        kind={kind}
        pageId={page.id}
        pageTitle={title}
        source={htmlSource}
        onApply={(html) => {
          setBeforeAi(htmlSource);
          setHtmlSource(html);
          setPreviewMode("live");
        }}
        onUndo={
          beforeAi !== null
            ? () => {
                setHtmlSource(beforeAi);
                setBeforeAi(null);
              }
            : undefined
        }
        canWrite={canWrite}
        aiConfigured={aiConfigured}
      />

      {/* Preview. */}
      <div className="flex flex-col gap-3 rounded-[14px] border-2 border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-heading text-lg">Preview</h2>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {previewMode === "live"
                ? "Updates as you type, and shows the page as a visitor gets it: anything that is not allowed is already gone. The built-in header and footer appear in the Saved view."
                : "The saved page exactly as a visitor receives it, drafts included."}
            </p>
          </div>
          <Segmented
            ariaLabel="Preview"
            options={[
              { value: "live", label: "Live" },
              { value: "saved", label: sourceDirty ? "Saved (older)" : "Saved" },
            ]}
            value={previewMode}
            onChange={setPreviewMode}
          />
        </div>
        {sampleNote ? <p className="text-xs font-medium text-muted-foreground">{sampleNote}</p> : null}

        {previewMode === "saved" ? (
          <>
            {sourceDirty ? (
              <p className="text-xs font-bold text-foreground">
                You have unsaved changes. This shows the last saved version.
              </p>
            ) : null}
            <PreviewFrame
              src={`/admin/preview/site/${page.id}`}
              title={`Preview of ${title}`}
              refreshToken={previewVersion}
              height={640}
            />
          </>
        ) : (
          <SiteLivePreview source={htmlSource} context={context} kind={kind} height={640} />
        )}
      </div>

      {/* SEO. */}
      <div className="grid max-w-3xl gap-4">
        <FormField
          label="Search title"
          htmlFor="sp-seo-title"
          hint="Shown in search results and the browser tab. Falls back to the page's own <title>, then the title above."
        >
          <TextInput
            id="sp-seo-title"
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            disabled={!canWrite}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Search description" htmlFor="sp-seo-desc" hint="One or two sentences.">
          <TextArea
            id="sp-seo-desc"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField
          label="Social share image"
          htmlFor="sp-og"
          hint="Shown when this page is shared on social media or chat. 1200×630 works best."
        >
          <div className="flex flex-col gap-2">
            {ogImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- object-storage URL, no loader configured
              <img
                src={ogImageUrl}
                alt=""
                width={384}
                height={96}
                className="h-24 w-full max-w-sm rounded-[10px] border-2 border-border object-cover"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="sp-og"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="max-w-full text-sm"
                disabled={!canWrite || ogUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setOgUploading(true);
                  const res = await uploadViaPresign("/api/tenant/site/uploads/presign", file);
                  setOgUploading(false);
                  if ("error" in res) {
                    setError(res.error);
                    return;
                  }
                  setOgImageKey(res.key);
                  setOgImageUrl(res.publicUrl);
                }}
              />
              {ogImageKey ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canWrite}
                  onClick={() => {
                    setOgImageKey(null);
                    setOgImageUrl(null);
                  }}
                >
                  Remove image
                </Button>
              ) : null}
            </div>
            {ogUploading ? (
              <p role="status" className="text-xs text-muted-foreground">
                Uploading…
              </p>
            ) : null}
          </div>
        </FormField>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p role="status" className="max-w-3xl rounded-[10px] border-2 border-warning bg-warning/15 px-3 py-2 text-[13px] font-medium text-foreground">
          {warning}
        </p>
      ) : null}
      {blocked ? (
        <p role="status" className="text-sm font-bold text-foreground">
          This cannot be published yet (see the list above). Fix it, or set Status to Draft to save your work.
        </p>
      ) : null}

      {canWrite ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void save()} disabled={pending || blocked}>
              {pending ? "Saving…" : status === "PUBLISHED" ? "Save and publish" : "Save draft"}
            </Button>
            {special && page.status === "PUBLISHED" ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void save({ status: "DRAFT" })}
              >
                Go back to the standard screen
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setTemplateName(title)}>
              Save as a design
            </Button>
            {dirty ? <span className="text-xs font-bold text-muted-foreground">Unsaved changes</span> : null}
            {!isHome ? (
              <Button type="button" variant="destructive" className="ml-auto" onClick={() => void onDelete()}>
                {special ? "Delete design" : "Delete page"}
              </Button>
            ) : null}
          </div>

          {templateName !== null ? (
            <form
              className="flex max-w-xl flex-wrap items-end gap-2 rounded-[12px] border-2 border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void saveAsTemplate();
              }}
            >
              <div className="min-w-0 flex-1 basis-56">
                <FormField label="Name for this design" htmlFor="sp-tpl-name" hint="It appears in your gallery for new pages of this kind.">
                  <TextInput
                    id="sp-tpl-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    maxLength={120}
                    autoComplete="off"
                  />
                </FormField>
              </div>
              <Button type="submit" size="sm" disabled={!templateName.trim()}>
                Save design
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setTemplateName(null)}>
                Cancel
              </Button>
            </form>
          ) : null}
        </div>
      ) : (
        <p className="text-sm font-medium text-muted-foreground">
          You can view this page but not change it.
        </p>
      )}

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        {galleryOpen ? (
          <DialogContent className="max-w-5xl overscroll-contain">
            <DialogTitle>Choose a design</DialogTitle>
            <DialogDescription>
              Designs made for a {kindDef.label.toLowerCase()}. Each picture is the real design with
              your own details in it. Choosing one replaces what is in the editor; nothing is saved
              until you press Save.
            </DialogDescription>
            <TemplateGallery
              className="mt-4"
              kind={kind}
              context={context}
              saved={saved}
              onChoose={(choice) => void chooseDesign(choice)}
              onDeleteSaved={(choice) => void deleteSaved(choice)}
            />
          </DialogContent>
        ) : null}
      </Dialog>

      <p className="text-xs text-muted-foreground">
        Public address:{" "}
        <code translate="no" className="font-mono">
          {publicPath}
        </code>
      </p>
    </div>
  );
}

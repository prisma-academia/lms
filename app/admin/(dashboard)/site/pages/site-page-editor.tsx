"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiDelete, apiPatch, apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { Icon } from "@/components/icon";
import { PreviewFrame } from "@/components/preview-frame";
import {
  BLOCK_TYPE_LABELS,
  newBlockId,
  type SiteBlock,
  type SiteBlockType,
} from "@/lib/site/blocks";
import type { SitePageRow } from "@/lib/site/pages";

const BLOCK_OPTIONS = (Object.keys(BLOCK_TYPE_LABELS) as SiteBlockType[]).map((t) => ({
  value: t,
  label: BLOCK_TYPE_LABELS[t],
}));

function emptyBlock(type: SiteBlockType): SiteBlock {
  const id = newBlockId();
  switch (type) {
    case "hero":
      return {
        type,
        id,
        subcopy: "",
        showLogo: true,
        showLocation: true,
        ctas: [
          { label: "Enroll now", href: "/auth/register", variant: "primary" },
          { label: "Sign in", href: "/auth/login", variant: "outline" },
        ],
      };
    case "richText":
    case "html":
      return { type, id, html: "" };
    case "about":
      return { type, id, title: "About us", showContact: true };
    case "benefits":
      return { type, id, title: "Benefits", items: [] };
    case "courses":
      return { type, id, title: "Courses", limit: 6 };
    case "steps":
      return { type, id, title: "How it works", items: [] };
    case "faq":
      return { type, id, title: "FAQ", items: [] };
    case "cta":
      return { type, id, headline: "Get started", ctas: [] };
    case "image":
      return { type, id, imageKey: "", alt: "" };
  }
}

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
  const [title, setTitle] = useState(page?.title ?? "New page");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [status, setStatus] = useState<"DRAFT" | "PUBLISHED">(page?.status ?? "DRAFT");
  const [showInNav, setShowInNav] = useState(page?.showInNav ?? true);
  const [navOrder, setNavOrder] = useState(String(page?.navOrder ?? 0));
  const [seoTitle, setSeoTitle] = useState(page?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(page?.seoDescription ?? "");
  const [blocks, setBlocks] = useState<SiteBlock[]>(page?.blocks ?? []);
  const [templateId, setTemplateId] = useState("classic");
  const [addType, setAddType] = useState<SiteBlockType>("richText");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  // Bumped on every successful save. The preview renders server-side from the
  // stored row, so it is only ever as fresh as the last save — this is what
  // makes it refresh at that moment instead of showing stale blocks.
  const [previewVersion, setPreviewVersion] = useState(0);

  const isHome = page?.isHome ?? false;

  const templateOptions = useMemo(
    () => templates.map((t) => ({ value: t.id, label: t.name })),
    [templates]
  );

  function updateBlock(id: string, next: SiteBlock) {
    setBlocks((prev) => prev.map((b) => (b.id === id ? next : b)));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    setBlocks((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }

  function removeBlock(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  }

  async function save() {
    setError(null);
    setInfo(null);
    setPending(true);
    if (isNew) {
      const res = await apiPost<{ page: SitePageRow }>("/api/tenant/site/pages", {
        title: title.trim(),
        slug: slug.trim() || undefined,
        templateId: blocks.length === 0 ? templateId : undefined,
        status,
        showInNav,
        navOrder: parseInt(navOrder, 10) || 0,
        seoTitle: seoTitle.trim() || null,
        seoDescription: seoDescription.trim() || null,
        blocks: blocks.length > 0 ? blocks : undefined,
      });
      setPending(false);
      if (res.error) {
        setError(res.error.message);
        return;
      }
      if (res.data?.page) router.push(`/admin/site/pages/${res.data.page.id}`);
      return;
    }

    const res = await apiPatch<{ page: SitePageRow }>(`/api/tenant/site/pages/${page!.id}`, {
      title: title.trim(),
      ...(isHome ? {} : { slug: slug.trim() }),
      status,
      showInNav,
      navOrder: parseInt(navOrder, 10) || 0,
      seoTitle: seoTitle.trim() || null,
      seoDescription: seoDescription.trim() || null,
      blocks,
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.page) {
      setBlocks(res.data.page.blocks);
      setInfo("Saved.");
      setPreviewVersion((v) => v + 1);
      router.refresh();
    }
  }

  /**
   * Save first, then show the preview. The preview is rendered on the server
   * from the stored page, so previewing unsaved edits is not something this can
   * honestly offer — saving is what makes the preview mean anything, and doing
   * it silently is better than a "Preview" button that shows yesterday's page.
   */
  async function saveAndPreview() {
    await save();
    setPreviewOpen(true);
  }

  async function applyTemplate() {
    if (!page || !canWrite) return;
    if (!confirm("Replace all blocks with this template?")) return;
    setPending(true);
    const res = await apiPatch<{ page: SitePageRow }>(`/api/tenant/site/pages/${page.id}`, {
      applyTemplateId: templateId as "classic" | "minimal" | "catalog",
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.page) {
      setBlocks(res.data.page.blocks);
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
      contentJson: { blocks },
    });
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setInfo("Saved as site_page template.");
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="sp-title">
          <TextInput
            id="sp-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
        <FormField label="Slug" htmlFor="sp-slug" hint={isHome ? "Home page uses /" : "Public URL path"}>
          <TextInput
            id="sp-slug"
            value={isHome ? "" : slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!canWrite || isHome}
            placeholder={isHome ? "(home)" : "about"}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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

      <FormField label="SEO title" htmlFor="sp-seo-title">
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

      {canWrite ? (
        <div className="flex flex-wrap items-end gap-3 rounded-[14px] border-2 border-border p-4">
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
              Applied on create if you have no blocks yet.
            </p>
          ) : (
            <Button type="button" variant="outline" onClick={applyTemplate} disabled={pending}>
              Apply template
            </Button>
          )}
        </div>
      ) : null}

      <div>
        <h2 className="font-heading text-lg">Blocks</h2>
        <div className="mt-3 flex flex-col gap-4">
          {blocks.map((block, index) => (
            <div key={block.id} className="rounded-[14px] border-2 border-border p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{BLOCK_TYPE_LABELS[block.type]}</span>
                {canWrite ? (
                  <div className="flex gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => moveBlock(index, -1)}>
                      Up
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => moveBlock(index, 1)}>
                      Down
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => removeBlock(block.id)}>
                      Remove
                    </Button>
                  </div>
                ) : null}
              </div>
              <BlockFields block={block} disabled={!canWrite} onChange={(b) => updateBlock(block.id, b)} />
            </div>
          ))}
        </div>

        {canWrite ? (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <FormField label="Add block" htmlFor="sp-add">
              <SelectInput
                id="sp-add"
                allowEmpty={false}
                options={BLOCK_OPTIONS}
                value={addType}
                onChange={(e) => setAddType(e.target.value as SiteBlockType)}
              />
            </FormField>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBlocks((prev) => [...prev, emptyBlock(addType)])}
            >
              Add
            </Button>
          </div>
        ) : null}
      </div>

      {!isNew ? (
        <div className="flex flex-col gap-3 rounded-[14px] border-2 border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-heading text-lg">Preview</h2>
              <p className="text-xs text-muted-foreground">
                The page as a visitor sees it — drafts included, so you can check
                it before publishing.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewOpen((o) => !o)}
              aria-expanded={previewOpen}
            >
              <Icon name={previewOpen ? "eye-off" : "eye"} />
              {previewOpen ? "Hide preview" : "Show preview"}
            </Button>
          </div>

          {previewOpen ? (
            <PreviewFrame
              src={`/admin/preview/site/${page!.id}`}
              title={`Preview of ${title}`}
              refreshToken={previewVersion}
              height={640}
            />
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {info ? <p className="text-sm text-green-700">{info}</p> : null}

      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : isNew ? "Create page" : "Save"}
          </Button>
          {!isNew ? (
            <Button type="button" variant="outline" onClick={saveAndPreview} disabled={pending}>
              <Icon name="eye" />
              Save &amp; preview
            </Button>
          ) : null}
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

function BlockFields({
  block,
  disabled,
  onChange,
}: {
  block: SiteBlock;
  disabled: boolean;
  onChange: (b: SiteBlock) => void;
}) {
  switch (block.type) {
    case "hero":
      return (
        <div className="grid gap-3">
          <FormField label="Headline (optional)" htmlFor={`${block.id}-h`}>
            <TextInput
              id={`${block.id}-h`}
              value={block.headline ?? ""}
              onChange={(e) => onChange({ ...block, headline: e.target.value })}
              disabled={disabled}
            />
          </FormField>
          <FormField label="Subcopy" htmlFor={`${block.id}-s`}>
            <TextArea
              id={`${block.id}-s`}
              value={block.subcopy ?? ""}
              onChange={(e) => onChange({ ...block, subcopy: e.target.value })}
              disabled={disabled}
            />
          </FormField>
        </div>
      );
    case "about":
      return (
        <div className="grid gap-3">
          <FormField label="Title" htmlFor={`${block.id}-t`}>
            <TextInput
              id={`${block.id}-t`}
              value={block.title ?? ""}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
              disabled={disabled}
            />
          </FormField>
          <FormField label="Body" htmlFor={`${block.id}-b`}>
            <TextArea
              id={`${block.id}-b`}
              value={block.body ?? ""}
              onChange={(e) => onChange({ ...block, body: e.target.value })}
              disabled={disabled}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={block.showContact}
              onChange={(e) => onChange({ ...block, showContact: e.target.checked })}
              disabled={disabled}
            />
            Show contact details
          </label>
        </div>
      );
    case "courses":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Title" htmlFor={`${block.id}-t`}>
            <TextInput
              id={`${block.id}-t`}
              value={block.title ?? ""}
              onChange={(e) => onChange({ ...block, title: e.target.value })}
              disabled={disabled}
            />
          </FormField>
          <FormField label="Limit" htmlFor={`${block.id}-l`}>
            <TextInput
              id={`${block.id}-l`}
              value={String(block.limit)}
              onChange={(e) =>
                onChange({ ...block, limit: Math.min(24, Math.max(1, parseInt(e.target.value, 10) || 6)) })
              }
              disabled={disabled}
            />
          </FormField>
        </div>
      );
    case "cta":
      return (
        <div className="grid gap-3">
          <FormField label="Headline" htmlFor={`${block.id}-h`}>
            <TextInput
              id={`${block.id}-h`}
              value={block.headline}
              onChange={(e) => onChange({ ...block, headline: e.target.value })}
              disabled={disabled}
            />
          </FormField>
          <FormField label="Subcopy" htmlFor={`${block.id}-s`}>
            <TextArea
              id={`${block.id}-s`}
              value={block.subcopy ?? ""}
              onChange={(e) => onChange({ ...block, subcopy: e.target.value })}
              disabled={disabled}
            />
          </FormField>
        </div>
      );
    case "richText":
    case "html":
      return (
        <FormField label="HTML" htmlFor={`${block.id}-html`}>
          <TextArea
            id={`${block.id}-html`}
            value={block.html}
            onChange={(e) => onChange({ ...block, html: e.target.value })}
            className="min-h-32 font-mono text-xs"
            disabled={disabled}
          />
        </FormField>
      );
    case "benefits":
    case "steps":
    case "faq":
      return (
        <FormField label="Items (JSON)" htmlFor={`${block.id}-items`}>
          <TextArea
            id={`${block.id}-items`}
            className="min-h-28 font-mono text-xs"
            value={JSON.stringify(
              block.type === "faq"
                ? block.items
                : block.type === "benefits"
                  ? block.items
                  : block.items,
              null,
              2
            )}
            onChange={(e) => {
              try {
                const items = JSON.parse(e.target.value);
                if (block.type === "faq") onChange({ ...block, items });
                else if (block.type === "benefits") onChange({ ...block, items });
                else onChange({ ...block, items });
              } catch {
                /* ignore while typing */
              }
            }}
            disabled={disabled}
          />
        </FormField>
      );
    case "image":
      return (
        <div className="grid gap-3">
          <FormField label="Image key (S3)" htmlFor={`${block.id}-k`}>
            <TextInput
              id={`${block.id}-k`}
              value={block.imageKey}
              onChange={(e) => onChange({ ...block, imageKey: e.target.value })}
              disabled={disabled}
            />
          </FormField>
          <FormField label="Alt" htmlFor={`${block.id}-a`}>
            <TextInput
              id={`${block.id}-a`}
              value={block.alt ?? ""}
              onChange={(e) => onChange({ ...block, alt: e.target.value })}
              disabled={disabled}
            />
          </FormField>
        </div>
      );
    default:
      return null;
  }
}

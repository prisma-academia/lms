"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput } from "@/components/form-field";
import { TemplateGallery, templateChoices, type TemplateChoice } from "@/components/site/template-gallery";
import { useSitePreviewContext } from "@/components/site/use-site-preview-context";
import { SITE_PAGE_KINDS, findPageKind, type SitePageKind } from "@/lib/site/site-api";
import { kindStarter } from "@/lib/site/kind-starters";
import type { SavedSiteTemplate } from "@/lib/site/saved-templates";
import type { SitePageRow } from "@/lib/site/pages";
import { cn } from "@/lib/utils";

/**
 * Making a page, in the order the decisions actually come: what kind of page,
 * what to call it, what it should look like.
 *
 * A new page is always created as a draft. For a built-in screen that matters:
 * a draft changes nothing for visitors, so an author can design a sign-in page
 * at leisure and only replace the standard one when theirs is ready.
 */
export function NewPageFlow({
  initialKind,
  existing,
  saved,
}: {
  initialKind: SitePageKind;
  /** Built-in screens this academy has already designed. */
  existing: { id: string; kind: SitePageKind }[];
  saved: SavedSiteTemplate[];
}) {
  const router = useRouter();
  const uid = useId();
  const taken = new Map(existing.map((p) => [p.kind, p.id] as const));

  const [kind, setKind] = useState<SitePageKind>(taken.has(initialKind) ? "PAGE" : initialKind);
  const [title, setTitle] = useState(initialKind === "PAGE" || taken.has(initialKind) ? "" : kindStarter(initialKind).title);
  const [slug, setSlug] = useState("");
  const [choiceKey, setChoiceKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { context } = useSitePreviewContext(kind);
  const def = findPageKind(kind);
  const special = kind !== "PAGE";
  const choices = templateChoices(kind, saved);
  const chosen: TemplateChoice | undefined = choices.find((c) => c.key === choiceKey) ?? choices[0];

  function pickKind(next: SitePageKind) {
    setKind(next);
    setChoiceKey(null);
    setError(null);
    // Offer the screen's usual name, unless the author has typed their own.
    const names = SITE_PAGE_KINDS.filter((k) => k.kind !== "PAGE").map((k) => kindStarter(k.kind as Exclude<SitePageKind, "PAGE">).title);
    if (!title.trim() || names.includes(title)) {
      setTitle(next === "PAGE" ? "" : kindStarter(next).title);
    }
  }

  async function create() {
    if (!title.trim()) {
      setError("Give the page a title.");
      document.getElementById(`${uid}-title`)?.focus();
      return;
    }
    setPending(true);
    setError(null);
    const res = await apiPost<{ page: SitePageRow }>("/api/tenant/site/pages", {
      kind,
      title: title.trim(),
      status: "DRAFT",
      ...(special ? {} : { slug: slug.trim() || undefined }),
      // A built-in design goes by its id; anything else by its markup.
      ...(chosen?.templateId ? { templateId: chosen.templateId } : chosen ? { htmlSource: chosen.html } : {}),
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data?.page) router.push(`/admin/site/pages/${res.data.page.id}`);
  }

  return (
    <div className="flex flex-col gap-8">
      <fieldset>
        <legend className="font-heading text-lg">1. What are you making?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {SITE_PAGE_KINDS.map((k) => {
            const existingId = taken.get(k.kind);
            const selected = kind === k.kind;
            return (
              <div
                key={k.kind}
                className={cn(
                  "rounded-[12px] border-2 bg-card p-3",
                  selected ? "border-primary shadow-md" : "border-border",
                  existingId && "opacity-90"
                )}
              >
                <label className={cn("flex items-start gap-2.5", existingId ? "cursor-not-allowed" : "cursor-pointer")}>
                  <input
                    type="radio"
                    name={`${uid}-kind`}
                    className="mt-1 size-4 shrink-0"
                    checked={selected}
                    disabled={Boolean(existingId)}
                    onChange={() => pickKind(k.kind)}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-foreground">{k.label}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{k.purpose}</span>
                    <code translate="no" className="mt-1 block font-mono text-[11px] text-muted-foreground">
                      {k.path}
                    </code>
                  </span>
                </label>
                {existingId ? (
                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    You already have one.{" "}
                    <Link href={`/admin/site/pages/${existingId}`} className="font-bold text-foreground underline underline-offset-2">
                      Edit it
                    </Link>
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        {special ? (
          <div className="mt-3 rounded-[12px] border-2 border-border bg-muted p-3 text-[13px] font-medium leading-relaxed text-foreground">
            <p>
              Publishing this replaces the standard screen at{" "}
              <code translate="no" className="font-mono">
                {def.path}
              </code>{" "}
              for every visitor. It starts as a draft, so nothing changes until you publish it
              {def.requiredForm ? ", and it can only be published once its form is complete" : ""}.
            </p>
            {def.requiredForm ? (
              <p className="mt-1 text-muted-foreground">
                The standard screen is never lost: it stays reachable at{" "}
                <code translate="no" className="font-mono">
                  {def.path}?builtin=1
                </code>
                , and you can go back to it at any time.
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <section>
        <h2 className="font-heading text-lg">2. Name it</h2>
        <div className="mt-3 grid max-w-3xl gap-4 sm:grid-cols-2">
          <FormField
            label="Title"
            htmlFor={`${uid}-title`}
            required
            hint={special ? "For your own reference in the page list." : "Shown in the site menu and the browser tab."}
          >
            <TextInput
              id={`${uid}-title`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={special ? def.label : "About us…"}
              autoComplete="off"
              maxLength={200}
            />
          </FormField>
          {special ? null : (
            <FormField
              label="Address (optional)"
              htmlFor={`${uid}-slug`}
              hint="The part after the / in the page's address. Left empty, it is made from the title."
            >
              <TextInput
                id={`${uid}-slug`}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="about…"
                autoComplete="off"
                spellCheck={false}
                maxLength={80}
              />
            </FormField>
          )}
        </div>
      </section>

      <section>
        <h2 className="font-heading text-lg">3. Choose a starting design</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
          Each picture is the real design with your own details in it. You can change every part of
          it afterwards, or switch to another design later.
        </p>
        <TemplateGallery
          className="mt-3"
          kind={kind}
          context={context}
          saved={saved}
          selectedKey={chosen?.key ?? null}
          onChoose={(choice) => setChoiceKey(choice.key)}
          chooseLabel="Choose"
          disabled={pending}
        />
      </section>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void create()} disabled={pending}>
          {pending ? "Creating…" : special ? `Create ${def.label.toLowerCase()} draft` : "Create page draft"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/site/pages">Cancel</Link>
        </Button>
        {chosen ? (
          <span className="text-xs font-medium text-muted-foreground">Design: {chosen.name}</span>
        ) : null}
      </div>
    </div>
  );
}

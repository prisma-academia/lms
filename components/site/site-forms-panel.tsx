"use client";

import { SITE_FORMS, findPageKind, formAllowedOn, type SitePageKind } from "@/lib/site/site-api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * What a page can DO: the platform's forms, as an author can use them.
 *
 * A site page cannot run script, so a form on it is a declaration — one
 * attribute and a few field names — and the platform does the rest. This panel
 * is where an author finds out which forms exist, which of them this kind of
 * page may contain, and what each one needs; "Insert" puts the catalogue's own
 * example at the cursor, so the names are right by construction.
 *
 * Built from `SITE_FORMS`, the same list the sanitizer enforces: a form that
 * is offered here is one that will survive being saved.
 */
export function SiteFormsPanel({
  kind,
  onInsert,
  className,
}: {
  kind: SitePageKind;
  /** Receives markup to place at the cursor. Absent when read-only. */
  onInsert?: (snippet: string) => void;
  className?: string;
}) {
  const here = SITE_FORMS.filter((form) => formAllowedOn(form, kind));
  const elsewhere = SITE_FORMS.filter((form) => !formAllowedOn(form, kind));

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <p className="text-xs leading-relaxed text-muted-foreground">
        A form is one attribute, <code translate="no" className="font-mono">data-lms-form</code>, on a normal{" "}
        <code translate="no" className="font-mono">&lt;form&gt;</code>. You design it; the platform submits
        it, shows errors, and takes the visitor where they should go.
      </p>

      <ul className="flex flex-col gap-3">
        {here.map((form) => (
          <li key={form.kind} className="rounded-[10px] border-2 border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-foreground">{form.label}</h3>
              {onInsert ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() => onInsert(`${form.example}\n`)}
                  aria-label={`Insert the ${form.label.toLowerCase()} at the cursor`}
                >
                  Insert
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{form.purpose}</p>
            <dl className="mt-2 flex flex-col gap-1">
              {form.fields.map((field) => (
                <div key={field.name} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                  <dt>
                    <code translate="no" className="font-mono text-foreground">
                      name=&quot;{field.name}&quot;
                    </code>
                  </dt>
                  <dd className="text-muted-foreground">
                    {field.label}
                    {field.required ? " · required" : " · optional"}
                    {field.note ? ` · ${field.note}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className="rounded-[10px] border-2 border-dashed border-border p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="font-bold text-foreground">Where messages appear</p>
        <p className="mt-1">
          Put an empty element with <code translate="no" className="font-mono">data-lms-error</code> inside
          the form and errors are written into it. A forgot-password form can also have one with{" "}
          <code translate="no" className="font-mono">data-lms-success</code>. Both stay hidden while empty.
        </p>
      </div>

      {elsewhere.length > 0 ? (
        <div className="text-xs leading-relaxed text-muted-foreground">
          <p className="font-bold text-foreground">Not on this page</p>
          <ul className="mt-1 flex flex-col gap-1">
            {elsewhere.map((form) => (
              <li key={form.kind}>
                {form.label}: only on the{" "}
                {form.allowedOn === "any"
                  ? "site"
                  : form.allowedOn.map((k) => findPageKind(k).label.toLowerCase()).join(" or ")}
                . Anywhere else it is turned into a plain box and its password field is removed.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

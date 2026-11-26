"use client";

import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import type { CertificateVariableDef } from "@/lib/certificates/variables";

/**
 * Every value a certificate can show, with what it is and a way to put it in.
 *
 * Autocomplete in the editor already offers these after `{{`, but only to
 * someone who knows to type `{{`. This is the same list in plain sight, built
 * from the same catalog, so the two can never disagree.
 */
export function VariablePanel({
  variables,
  onInsert,
  canInsert,
}: {
  variables: readonly CertificateVariableDef[];
  /** Write `text` into the editor at the cursor. */
  onInsert: (text: string) => void;
  canInsert: boolean;
}) {
  const uid = useId();

  return (
    <section aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className="text-sm font-bold text-foreground">
        Variables
      </h3>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">
        Filled in for each learner when the certificate is issued.
        {canInsert ? " Choose one to insert it where your cursor is." : ""}
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {variables.map((variable) => {
          const token = `{{ ${variable.path} }}`;
          const inserted = variable.snippet ?? token;
          return (
            <li
              key={variable.path}
              className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border-2 border-border bg-background p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                {canInsert ? (
                  <button
                    type="button"
                    onClick={() => onInsert(inserted)}
                    title={`Insert ${inserted}`}
                    className="max-w-full truncate rounded-[6px] border-2 border-border bg-card px-2 py-1 font-mono text-[12px] font-bold text-card-foreground shadow-sm outline-none [touch-action:manipulation] hover:bg-accent hover:text-accent-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-x-px active:translate-y-px active:shadow-none"
                  >
                    <span className="sr-only">Insert </span>
                    {token}
                  </button>
                ) : (
                  <code className="max-w-full truncate rounded-[6px] border-2 border-border bg-card px-2 py-1 font-mono text-[12px] font-bold">
                    {token}
                  </code>
                )}
                {variable.required ? <Badge color="var(--warning)">Required</Badge> : null}
              </div>
              <p className="text-[13px] font-medium text-foreground">{variable.label}</p>
              {/* For a variable with a snippet, this sentence quotes the exact
                  markup the button inserts, so the two cannot surprise anyone. */}
              {variable.usage ? (
                <p className="break-words text-xs font-medium text-muted-foreground">{variable.usage}</p>
              ) : null}
              {variable.sample ? (
                <p className="text-xs font-medium text-muted-foreground">
                  For example: <span className="text-foreground">{variable.sample}</span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

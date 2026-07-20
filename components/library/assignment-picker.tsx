"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextInput } from "@/components/form-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Icon } from "@/components/icon";
import type { GrantView } from "./types";

type SubjectType = GrantView["subjectType"];

type Subject = { id: string; label: string; hint?: string };

const SECTIONS: { type: Exclude<SubjectType, "ALL_CLIENTS">; label: string; noun: string }[] = [
  { type: "CLIENT", label: "Individual learners", noun: "learner" },
  { type: "CLIENT_GROUP", label: "Learner groups", noun: "group" },
  { type: "COURSE", label: "Course members", noun: "course" },
  { type: "PROGRAMME", label: "Programme members", noun: "programme" },
];

/** Searchable async picker for one subject type. */
function SubjectSearch({
  type,
  noun,
  onPick,
}: {
  type: SubjectType;
  noun: string;
  onPick: (s: Subject) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(
    async (term: string) => {
      setLoading(true);
      const res = await apiGet<{ subjects: Subject[] }>(
        `/api/tenant/library/subjects?type=${type}&q=${encodeURIComponent(term)}`
      );
      setLoading(false);
      setResults(res.data?.subjects ?? []);
    },
    [type]
  );

  useEffect(() => {
    const t = setTimeout(() => void search(q), 200);
    return () => clearTimeout(t);
  }, [q, search]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Icon name="plus" /> Add {noun}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <TextInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${noun}s…`}
          aria-label={`Search ${noun}s`}
          autoFocus
        />
        <div className="mt-2 flex flex-col gap-0.5">
          {loading ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">No matches.</p>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                className="rounded-[8px] px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="block truncate font-medium">{s.label}</span>
                {s.hint ? <span className="block truncate text-xs text-muted-foreground">{s.hint}</span> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AssignmentPicker({
  grants,
  onAdd,
  onRemove,
  disabled,
}: {
  grants: GrantView[];
  onAdd: (subjectType: SubjectType, subjectId?: string) => void;
  onRemove: (grantId: string) => void;
  disabled?: boolean;
}) {
  const everyone = grants.find((g) => g.subjectType === "ALL_CLIENTS");

  const summary = (() => {
    if (everyone) return "Visible to every learner in this tenant.";
    const counts = SECTIONS.map((s) => ({
      noun: s.noun,
      n: grants.filter((g) => g.subjectType === s.type).length,
    })).filter((c) => c.n > 0);
    if (counts.length === 0) return "Not assigned to anyone yet.";
    return `Visible to ${counts.map((c) => `${c.n} ${c.noun}${c.n === 1 ? "" : "s"}`).join(", ")}.`;
  })();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{summary}</p>

      <div className="flex items-center justify-between gap-2 rounded-[8px] border-2 border-border bg-background p-2">
        <span className="text-sm font-bold">Everyone in this tenant</span>
        {everyone ? (
          <Button type="button" size="xs" variant="ghost" disabled={disabled} onClick={() => onRemove(everyone.id)}>
            Remove
          </Button>
        ) : (
          <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => onAdd("ALL_CLIENTS")}>
            Add
          </Button>
        )}
      </div>

      {SECTIONS.map((section) => {
        const rows = grants.filter((g) => g.subjectType === section.type);
        return (
          <div key={section.type}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold">{section.label}</span>
              {!disabled ? (
                <SubjectSearch
                  type={section.type}
                  noun={section.noun}
                  onPick={(s) => onAdd(section.type, s.id)}
                />
              ) : null}
            </div>
            {rows.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {rows.map((g) => (
                  <span key={g.id} className="inline-flex items-center gap-1">
                    <Badge>{g.label}</Badge>
                    {!disabled ? (
                      <button
                        type="button"
                        aria-label={`Remove ${g.label}`}
                        onClick={() => onRemove(g.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Icon name="x" className="size-3.5" />
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">None</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

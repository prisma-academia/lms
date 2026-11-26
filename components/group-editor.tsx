"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { useSavedSnapshot, useUnsavedGuard } from "@/components/use-unsaved-guard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, TextInput, TextArea } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

export type GroupCandidate = { id: string; label: string; email: string };

/**
 * Shared editor for a tenant group (user group or client group): edit name +
 * description and manage the full membership set via checkboxes. Parameterized
 * so both `/admin/user-groups` and `/admin/client-groups` reuse it.
 */
export function GroupEditor({
  id,
  name: initialName,
  description: initialDescription,
  candidates,
  memberIds,
  apiBase,
  membersField,
  listHref,
  memberNoun,
}: {
  id: string;
  name: string;
  description: string | null;
  candidates: GroupCandidate[];
  memberIds: string[];
  apiBase: string;
  membersField: "userIds" | "clientIds";
  listHref: string;
  memberNoun: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const uid = useId();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(memberIds));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Closing or reloading the tab over unsaved changes asks first. Members are
  // compared as a sorted list, so ticking one and unticking it again is clean.
  const saved = useSavedSnapshot({ name, description, members: [...selected].sort() });
  useUnsavedGuard(saved.dirty);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) => c.label.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [candidates, query]);

  function toggle(cid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  }

  async function onSave() {
    setError(null);
    if (!name.trim()) {
      setError("Give the group a name.");
      return;
    }
    setSaving(true);
    try {
      const detailsRes = await apiPatch(`${apiBase}/${id}`, {
        name,
        description: description.trim() === "" ? null : description,
      });
      if (detailsRes.error) {
        setError(detailsRes.error.message);
        return;
      }
      const membersRes = await apiPost(`${apiBase}/${id}/members`, {
        [membersField]: [...selected],
      });
      if (membersRes.error) {
        setError(membersRes.error.message);
        return;
      }
      saved.markSaved();
      toast("Group saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    const ok = await confirm({
      title: `Delete “${initialName}”?`,
      description: `The group is removed. Its ${memberNoun}s are not deleted, and this cannot be undone.`,
      confirmLabel: "Delete group",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    setDeleting(true);
    const res = await apiDelete(`${apiBase}/${id}`);
    if (res.error) {
      setError(res.error.message);
      setDeleting(false);
      return;
    }
    toast("Group deleted.");
    router.push(listHref);
  }

  return (
    <div className="grid max-w-2xl gap-5">
      <FormField label="Name" htmlFor={`${uid}-name`}>
        <TextInput
          id={`${uid}-name`}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField label="Description (optional)" htmlFor={`${uid}-description`}>
        <TextArea
          id={`${uid}-description`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>

      <div role="group" aria-labelledby={`${uid}-members`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span id={`${uid}-members`} className="text-[13px] font-bold text-foreground">
            Members <span className="num font-medium text-muted-foreground">({selected.size} chosen)</span>
          </span>
          <label htmlFor={`${uid}-search`} className="sr-only">
            Search {memberNoun}s
          </label>
          <input
            id={`${uid}-search`}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${memberNoun}s…`}
            className="w-full rounded-[10px] border-2 border-border bg-card px-3 py-1.5 text-sm text-card-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring sm:w-64"
          />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-[10px] border-2 border-border">
          {candidates.length === 0 ? (
            <p className="p-3 text-sm font-medium text-muted-foreground">
              There are no {memberNoun}s to add yet.
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-3 text-sm font-medium text-muted-foreground">
              No {memberNoun}s match “{query.trim()}”.
            </p>
          ) : (
            filtered.map((c) => {
              const boxId = `${uid}-m-${c.id}`;
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 border-b border-border px-3 last:border-b-0 hover:bg-accent hover:text-accent-foreground"
                >
                  <Checkbox
                    id={boxId}
                    checked={selected.has(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                  />
                  {/* The label fills the row, so the whole row is the target. */}
                  <label htmlFor={boxId} className="min-w-0 flex-1 cursor-pointer py-2.5">
                    <span className="block truncate text-sm font-bold">{c.label}</span>
                    <span className="block truncate text-xs font-medium opacity-80">{c.email}</span>
                  </label>
                </div>
              );
            })
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}

      {/* The destructive action sits apart from Save, at the far end. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" onClick={onSave} disabled={saving || deleting}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting || saving}>
          {deleting ? "Deleting…" : "Delete group"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea } from "@/components/form-field";

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
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(memberIds));
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    setInfo(null);
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
      setInfo("Saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this group? Members are not deleted, only the grouping.")) return;
    setError(null);
    setDeleting(true);
    const res = await apiDelete(`${apiBase}/${id}`);
    if (res.error) {
      setError(res.error.message);
      setDeleting(false);
      return;
    }
    router.push(listHref);
  }

  return (
    <div className="grid gap-5">
      <FormField label="Name" htmlFor="name">
        <TextInput id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <FormField label="Description (optional)" htmlFor="description">
        <TextArea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-ink">
            Members ({selected.size})
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${memberNoun}s…`}
            className="rounded-[10px] border-2 border-ink bg-card px-3 py-1.5 text-sm outline-none"
          />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-[10px] border-2 border-ink">
          {filtered.length === 0 ? (
            <p className="p-3 text-sm text-ink/60">No {memberNoun}s found.</p>
          ) : (
            filtered.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 border-b border-ink/10 px-3 py-2 last:border-b-0 hover:bg-paper"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="size-4"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{c.label}</span>
                  <span className="block truncate text-xs text-ink/55">{c.email}</span>
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-red">{error}</p> : null}
      {info ? <p className="text-sm text-ink/70">{info}</p> : null}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete group"}
        </Button>
      </div>
    </div>
  );
}

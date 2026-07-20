"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea } from "@/components/form-field";

export function TemplateForm({
  mode,
  id,
  initial,
  canWrite,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: { type: string; name: string; contentJson: string };
  canWrite: boolean;
}) {
  const router = useRouter();
  const [type, setType] = useState(initial.type);
  const [name, setName] = useState(initial.name);
  const [content, setContent] = useState(initial.contentJson);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setInfo(null);
    if (!type.trim() || !name.trim()) return setError("Type and name are required.");
    let parsed: Record<string, unknown> = {};
    if (content.trim()) {
      try {
        parsed = JSON.parse(content);
      } catch {
        return setError("Content must be valid JSON.");
      }
    }
    setPending(true);
    const payload = { type: type.trim(), name: name.trim(), contentJson: parsed };
    const res =
      mode === "create"
        ? await apiPost("/api/tenant/templates", payload)
        : await apiPatch(`/api/tenant/templates/${id}`, payload);
    setPending(false);
    if (res.error) return setError(res.error.message);
    if (mode === "create") router.push("/admin/templates");
    else {
      setInfo("Saved.");
      router.refresh();
    }
  }

  async function onDelete() {
    if (!confirm("Delete this template?")) return;
    const res = await apiDelete(`/api/tenant/templates/${id}`);
    if (res.error) return setError(res.error.message);
    router.push("/admin/templates");
  }

  return (
    <div className="grid max-w-xl gap-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Type" htmlFor="t-type" hint="e.g. email, page, certificate">
          <TextInput id="t-type" value={type} onChange={(e) => setType(e.target.value)} disabled={!canWrite} />
        </FormField>
        <FormField label="Name" htmlFor="t-name">
          <TextInput id="t-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
        </FormField>
      </div>
      <FormField label="Content (JSON)" htmlFor="t-content">
        <TextArea id="t-content" value={content} onChange={(e) => setContent(e.target.value)} className="min-h-48 font-mono text-xs" disabled={!canWrite} />
      </FormField>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
      {canWrite ? (
        <div className="flex gap-3">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create template" : "Save"}
          </Button>
          {mode === "edit" ? <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button> : null}
        </div>
      ) : null}
    </div>
  );
}

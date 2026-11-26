"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, apiPatch, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea } from "@/components/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { TEMPLATE_TYPE_LABELS } from "@/lib/templates/types";

const KNOWN_TYPES = Object.entries(TEMPLATE_TYPE_LABELS);

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
  const confirm = useConfirm();
  const { toast } = useToast();
  const [type, setType] = useState(initial.type);
  const [name, setName] = useState(initial.name);
  const [content, setContent] = useState(initial.contentJson);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!type.trim() || !name.trim()) return setError("Enter both a type and a name.");
    let parsed: Record<string, unknown> = {};
    if (content.trim()) {
      try {
        parsed = JSON.parse(content);
      } catch (err) {
        // Say where it went wrong: "invalid JSON" alone leaves the author hunting.
        const detail = err instanceof Error ? ` (${err.message})` : "";
        return setError(`The content is not valid JSON${detail}. Check for a missing quote, comma or bracket.`);
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
    if (mode === "create") {
      toast("Template created");
      router.push("/admin/templates");
    } else {
      toast("Template saved");
      router.refresh();
    }
  }

  async function onDelete() {
    const yes = await confirm({
      title: `Delete “${initial.name}”?`,
      description: "The template is removed for everyone at your academy. This cannot be undone.",
      confirmLabel: "Delete template",
      destructive: true,
    });
    if (!yes) return;
    setDeleting(true);
    const res = await apiDelete(`/api/tenant/templates/${id}`);
    setDeleting(false);
    if (res.error) return setError(res.error.message);
    toast("Template deleted");
    router.push("/admin/templates");
  }

  return (
    <form onSubmit={submit} className="grid max-w-xl gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Type"
          htmlFor="t-type"
          hint="What the template is for. Pick a suggestion or type your own."
        >
          <TextInput
            id="t-type"
            name="type"
            list="t-type-options"
            autoComplete="off"
            spellCheck={false}
            value={type}
            onChange={(e) => setType(e.target.value)}
            disabled={!canWrite}
          />
          <datalist id="t-type-options">
            {KNOWN_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </datalist>
        </FormField>
        <FormField label="Name" htmlFor="t-name">
          <TextInput
            id="t-name"
            name="name"
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canWrite}
          />
        </FormField>
      </div>
      <FormField
        label="Content"
        htmlFor="t-content"
        hint="Written as JSON — the format the app stores templates in. Leave it as {} for an empty template."
      >
        <TextArea
          id="t-content"
          name="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-48 font-mono text-xs"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={!canWrite}
        />
      </FormField>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {canWrite ? (
        // The destructive action sits apart from the primary one.
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="submit" disabled={pending || deleting}>
            {pending ? "Saving…" : mode === "create" ? "Create template" : "Save changes"}
          </Button>
          {mode === "edit" ? (
            <Button type="button" variant="destructive" onClick={onDelete} disabled={pending || deleting}>
              {deleting ? "Deleting…" : "Delete template"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";

type Option = { value: string; label: string };

export function ComposeForm({ clients, groups }: { clients: Option[]; groups: Option[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("MESSAGE");
  const [audience, setAudience] = useState<"ALL" | "CLIENT" | "GROUP">("ALL");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!subject.trim() || !body.trim()) return setError("Subject and body are required.");
    if (audience !== "ALL" && !target) return setError(`Select a ${audience === "CLIENT" ? "client" : "group"}.`);
    setError(null);
    setPending(true);
    const res = await apiPost<{ recipientCount: number }>("/api/tenant/messages", {
      subject: subject.trim(),
      body: body.trim(),
      category,
      audience,
      clientId: audience === "CLIENT" ? target : null,
      clientGroupId: audience === "GROUP" ? target : null,
    });
    setPending(false);
    if (res.error) return setError(res.error.message);
    router.push("/admin/messages");
  }

  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Subject" htmlFor="m-subject">
        <TextInput id="m-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </FormField>
      <FormField label="Message" htmlFor="m-body">
        <TextArea id="m-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40" />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Category" htmlFor="m-cat">
          <SelectInput
            id="m-cat"
            allowEmpty={false}
            options={[
              { value: "MESSAGE", label: "Message" },
              { value: "ANNOUNCEMENT", label: "Announcement" },
              { value: "REMINDER", label: "Reminder" },
            ]}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </FormField>
        <FormField label="Audience" htmlFor="m-aud">
          <SelectInput
            id="m-aud"
            allowEmpty={false}
            options={[
              { value: "ALL", label: "All clients" },
              { value: "CLIENT", label: "A client" },
              { value: "GROUP", label: "A client group" },
            ]}
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value as "ALL" | "CLIENT" | "GROUP");
              setTarget("");
            }}
          />
        </FormField>
      </div>
      {audience !== "ALL" ? (
        <FormField label={audience === "CLIENT" ? "Client" : "Client group"} htmlFor="m-target">
          <SelectInput
            id="m-target"
            placeholder={`Select a ${audience === "CLIENT" ? "client" : "group"}…`}
            options={audience === "CLIENT" ? clients : groups}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </FormField>
      ) : null}
      {error ? <p className="text-sm text-red">{error}</p> : null}
      <div>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
      </div>
    </div>
  );
}

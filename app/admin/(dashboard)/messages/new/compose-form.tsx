"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";

type Option = { value: string; label: string };

export function ComposeForm({ clients, groups }: { clients: Option[]; groups: Option[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("MESSAGE");
  const [audience, setAudience] = useState<"ALL" | "CLIENT" | "GROUP">("ALL");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!subject.trim()) return setError("Give the message a subject.");
    if (!body.trim()) return setError("Write the message before sending it.");
    if (audience !== "ALL" && !target) {
      return setError(`Choose the ${audience === "CLIENT" ? "learner" : "learner group"} to send it to.`);
    }
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
    const count = res.data?.recipientCount;
    toast(
      typeof count === "number"
        ? `Message sent to ${count} learner${count === 1 ? "" : "s"}.`
        : "Message sent."
    );
    router.push("/admin/messages");
  }

  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Subject" htmlFor="m-subject">
        <TextInput id="m-subject" autoComplete="off" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </FormField>
      <FormField label="Message" htmlFor="m-body">
        <TextArea id="m-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40" />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Kind of message" htmlFor="m-cat">
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
        <FormField label="Send to" htmlFor="m-aud">
          <SelectInput
            id="m-aud"
            allowEmpty={false}
            options={[
              { value: "ALL", label: "All learners" },
              { value: "CLIENT", label: "One learner" },
              { value: "GROUP", label: "A learner group" },
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
        <FormField label={audience === "CLIENT" ? "Learner" : "Learner group"} htmlFor="m-target">
          <SelectInput
            id="m-target"
            placeholder={`Choose a ${audience === "CLIENT" ? "learner" : "group"}…`}
            options={audience === "CLIENT" ? clients : groups}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </FormField>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/messages">Cancel</Link>
        </Button>
        <p className="basis-full text-xs font-medium text-muted-foreground">
          A sent message cannot be edited or taken back.
        </p>
      </div>
    </div>
  );
}

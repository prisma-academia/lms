"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, TextInput, SelectInput } from "@/components/form-field";

type Option = { value: string; label: string };

export function CreateCertificateForm({ courses, programmes }: { courses: Option[]; programmes: Option[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [linkType, setLinkType] = useState<"none" | "course" | "programme">("none");
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!name.trim()) return setError("Name is required.");
    if (linkType !== "none" && !link) return setError(`Select a ${linkType}.`);
    setError(null);
    setPending(true);
    const res = await apiPost<{ certificate: { id: string } }>("/api/tenant/certificates", {
      name: name.trim(),
      courseId: linkType === "course" ? link : null,
      programmeId: linkType === "programme" ? link : null,
    });
    setPending(false);
    if (res.error) return setError(res.error.message);
    router.push(`/admin/certificates/${res.data!.certificate.id}`);
  }

  return (
    <div className="grid max-w-xl gap-4">
      <FormField label="Name" htmlFor="c-name">
        <TextInput id="c-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Award on completion of" htmlFor="c-link-type">
          <SelectInput
            id="c-link-type"
            allowEmpty={false}
            options={[
              { value: "none", label: "Standalone (manual only)" },
              { value: "course", label: "A course" },
              { value: "programme", label: "A programme" },
            ]}
            value={linkType}
            onChange={(e) => {
              setLinkType(e.target.value as "none" | "course" | "programme");
              setLink("");
            }}
          />
        </FormField>
        {linkType !== "none" ? (
          <FormField label={linkType === "course" ? "Course" : "Programme"} htmlFor="c-link">
            <SelectInput
              id="c-link"
              placeholder={`Select a ${linkType}…`}
              options={linkType === "course" ? courses : programmes}
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </FormField>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Creating…" : "Create certificate"}
        </Button>
      </div>
    </div>
  );
}

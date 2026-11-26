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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the certificate a name.");
    if (linkType !== "none" && !link) return setError(`Choose a ${linkType}.`);
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
    <form onSubmit={submit} className="grid max-w-xl gap-4">
      <FormField label="Name" htmlFor="c-name" hint="Learners see this name in their list of certificates.">
        <TextInput
          id="c-name"
          name="name"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          label="Award it when a learner finishes"
          htmlFor="c-link-type"
          hint={linkType === "none" ? "You award it to learners yourself." : undefined}
        >
          <SelectInput
            id="c-link-type"
            allowEmpty={false}
            options={[
              { value: "none", label: "Nothing — I will award it by hand" },
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
              placeholder={`Choose a ${linkType}…`}
              options={linkType === "course" ? courses : programmes}
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </FormField>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create certificate"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput, TextArea } from "@/components/form-field";
import { useToast } from "@/components/ui/toast";
import type { SelectOption } from "@/lib/geo/options";

function slugFromTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function NewCourseForm({ currencyOptions }: { currencyOptions: SelectOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("NGN");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onTitleChange(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugFromTitle(value));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Give the course a title.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug.trim())) {
      setError("The web address can only use lowercase letters, numbers and hyphens.");
      return;
    }
    const priceCents =
      price.trim() === "" ? null : Math.round(parseFloat(price) * 100);
    if (price.trim() !== "" && (Number.isNaN(priceCents) || priceCents! < 0)) {
      setError("Enter a valid price, or leave it empty for a free course.");
      return;
    }

    setPending(true);
    const res = await apiPost<{ course: { id: string } }>("/api/tenant/courses", {
      title: title.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      priceCents,
      currency,
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    toast("Course created. Now add its lessons.");
    if (res.data?.course.id) router.push(`/admin/courses/${res.data.course.id}`);
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      <FormField label="Title" htmlFor="title">
        <TextInput
          id="title"
          autoComplete="off"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          required
        />
      </FormField>
      <FormField
        label="Web address"
        htmlFor="slug"
        hint="The last part of the course link. Lowercase letters, numbers and hyphens."
      >
        <TextInput
          id="slug"
          autoComplete="off"
          spellCheck={false}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          required
        />
      </FormField>
      <FormField
        label="Description (optional)"
        htmlFor="description"
        hint="Shown on the course page, before a learner enrolls."
      >
        <TextArea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Price" htmlFor="price" hint="Leave empty for a free course.">
          <TextInput
            id="price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </FormField>
        <FormField label="Currency" htmlFor="currency">
          <SelectInput
            id="currency"
            allowEmpty={false}
            options={currencyOptions}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </FormField>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create course"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/admin/courses">Cancel</Link>
        </Button>
      </div>
      <p className="text-xs font-medium text-muted-foreground">
        The course starts as a draft. Learners cannot see it until you publish it.
      </p>
    </form>
  );
}

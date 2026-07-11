"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { FormField, SelectInput, TextInput, TextArea } from "@/components/form-field";
import { getCurrencyOptions } from "@/lib/geo/currencies";

const CURRENCY_OPTIONS = getCurrencyOptions();

function slugFromTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function NewCourseForm() {
  const router = useRouter();
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
    setPending(true);

    const priceCents =
      price.trim() === "" ? null : Math.round(parseFloat(price) * 100);
    if (price.trim() !== "" && (Number.isNaN(priceCents) || priceCents! < 0)) {
      setError("Enter a valid price.");
      setPending(false);
      return;
    }

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
    if (res.data?.course.id) router.push(`/admin/courses/${res.data.course.id}`);
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <FormField label="Title" htmlFor="title">
        <TextInput
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          required
        />
      </FormField>
      <FormField label="Slug" htmlFor="slug">
        <TextInput
          id="slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          pattern="^[a-z0-9-]+$"
          required
        />
      </FormField>
      <FormField label="Description" htmlFor="description">
        <TextArea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
        />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Price (leave empty for free)" htmlFor="price">
          <TextInput
            id="price"
            type="number"
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
            options={CURRENCY_OPTIONS}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </FormField>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create course"}
        </Button>
      </div>
    </form>
  );
}

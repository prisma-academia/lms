"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { CertificateRender } from "@/components/certificate-render";
import type { CertificateDesign } from "@/lib/certificates/design";

export type AwardRow = { id: string; serial: string; client: string; issuedAt: string };
type Option = { value: string; label: string };

const SAMPLE = {
  clientName: "Ada Lovelace",
  courseTitle: "Intro to Analytics",
  programmeTitle: "Data Foundations",
  date: new Date(2026, 0, 1).toLocaleDateString(),
  serial: "CERT-XXXXXXXXXX",
};

export function CertificateEditor({
  id,
  name: initialName,
  design: initialDesign,
  awards,
  clients,
  canWrite,
}: {
  id: string;
  name: string;
  design: CertificateDesign;
  awards: AwardRow[];
  clients: Option[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [design, setDesign] = useState<CertificateDesign>(initialDesign);
  const [issueClient, setIssueClient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CertificateDesign>(key: K, value: CertificateDesign[K]) {
    setDesign((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setError(null);
    setInfo(null);
    setSaving(true);
    const res = await apiPatch(`/api/tenant/certificates/${id}`, { name: name.trim(), contentJson: design });
    setSaving(false);
    if (res.error) return setError(res.error.message);
    setInfo("Saved.");
    router.refresh();
  }

  async function issue() {
    if (!issueClient) return setError("Select a learner to issue to.");
    setError(null);
    const res = await apiPost(`/api/tenant/certificates/${id}/awards`, { clientId: issueClient });
    if (res.error) return setError(res.error.message);
    setInfo("Certificate issued.");
    setIssueClient("");
    router.refresh();
  }

  async function onDelete() {
    if (!confirm("Delete this certificate and all its awards?")) return;
    const res = await apiDelete(`/api/tenant/certificates/${id}`);
    if (res.error) return setError(res.error.message);
    router.push("/admin/certificates");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold uppercase text-stone-500">Design</h2>
          <p className="mt-1 text-xs text-stone-500">
            Placeholders: {"{{clientName}}"}, {"{{courseTitle}}"}, {"{{programmeTitle}}"}, {"{{date}}"}, {"{{serial}}"}.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <FormField label="Certificate name (internal)" htmlFor="c-name">
              <TextInput id="c-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canWrite} />
            </FormField>
            <FormField label="Title" htmlFor="d-title">
              <TextInput id="d-title" value={design.title} onChange={(e) => set("title", e.target.value)} disabled={!canWrite} />
            </FormField>
            <FormField label="Subtitle" htmlFor="d-sub">
              <TextInput id="d-sub" value={design.subtitle} onChange={(e) => set("subtitle", e.target.value)} disabled={!canWrite} />
            </FormField>
            <FormField label="Body" htmlFor="d-body">
              <TextArea id="d-body" value={design.bodyText} onChange={(e) => set("bodyText", e.target.value)} disabled={!canWrite} />
            </FormField>
            <FormField label="Footer" htmlFor="d-foot">
              <TextInput id="d-foot" value={design.footerText} onChange={(e) => set("footerText", e.target.value)} disabled={!canWrite} />
            </FormField>
            <FormField label="Accent color" htmlFor="d-accent">
              <input
                id="d-accent"
                type="color"
                value={design.accentColor}
                onChange={(e) => set("accentColor", e.target.value)}
                disabled={!canWrite}
                className="h-10 w-20 cursor-pointer rounded border-2 border-ink"
              />
            </FormField>
            {error ? <p className="text-sm text-red">{error}</p> : null}
            {info ? <p className="text-sm text-ink/70">{info}</p> : null}
            {canWrite ? (
              <div className="flex gap-3">
                <Button type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
                <Button type="button" variant="destructive" onClick={onDelete}>Delete</Button>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase text-stone-500">Live preview</h2>
          <div className="mt-4">
            <CertificateRender design={design} data={SAMPLE} />
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold uppercase text-stone-500">Awards ({awards.length})</h2>
        {canWrite ? (
          <div className="mt-3 flex max-w-xl items-end gap-2">
            <div className="flex-1">
              <FormField label="Issue to a learner" htmlFor="issue-client">
                <SelectInput
                  id="issue-client"
                  placeholder="Select a learner…"
                  options={clients}
                  value={issueClient}
                  onChange={(e) => setIssueClient(e.target.value)}
                />
              </FormField>
            </div>
            <Button type="button" onClick={issue}>Issue</Button>
          </div>
        ) : null}
        {awards.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No awards issued yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {awards.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-ink bg-paper px-3 py-2 text-sm">
                <span className="font-semibold text-ink">{a.client}</span>
                <span className="text-xs text-ink/60">
                  {a.serial} · {new Date(a.issuedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

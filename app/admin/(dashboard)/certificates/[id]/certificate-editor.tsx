"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { autocompletion } from "@codemirror/autocomplete";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/shell";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { CertificateRender } from "@/components/certificate-render";
import { SiteLivePreview } from "@/components/site-live-preview";
import { variableCompletion } from "@/lib/site/variable-completion";
import { CERTIFICATE_VARIABLES, certificateSampleContext } from "@/lib/certificates/variables";
import { classicCertificateHtml } from "@/lib/certificates/templates";
import type { CertificateDesign } from "@/lib/certificates/design";
import type { VariableContext } from "@/lib/site/template";

// CodeMirror builds against a real DOM, and there is no reason for ~200KB of
// editor to sit in the bundle of a page that may never switch to HTML mode.
const CodeEditor = dynamic(
  () => import("@/components/code-editor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <div className="h-96 animate-pulse rounded-[14px] border-2 border-border bg-muted/40" />
    ),
  }
);

export type AwardRow = { id: string; serial: string; client: string; issuedAt: string };
export type TenantBranding = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
};
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
  branding,
}: {
  id: string;
  name: string;
  design: CertificateDesign;
  awards: AwardRow[];
  clients: Option[];
  canWrite: boolean;
  branding: TenantBranding;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [design, setDesign] = useState<CertificateDesign>(initialDesign);
  const [issueClient, setIssueClient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const completion = useMemo(
    () => autocompletion({ override: [variableCompletion(CERTIFICATE_VARIABLES)] }),
    []
  );

  // Real branding, sample award data: the author is checking their layout, not
  // a specific learner, but a preview with someone else's logo is no preview.
  const previewContext = useMemo(
    () =>
      certificateSampleContext({
        tenantName: branding.name,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
        accentColor: design.accentColor,
      }) as VariableContext,
    [branding, design.accentColor]
  );

  function set<K extends keyof CertificateDesign>(key: K, value: CertificateDesign[K]) {
    setDesign((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Switching to HTML seeds the starter template rather than an empty document.
   * An empty editor is a worse starting point than markup to edit — especially
   * when the print rules and the aspect ratio are the parts nobody would think
   * to write from scratch.
   */
  function switchToHtml() {
    setDesign((prev) => ({
      ...prev,
      mode: "html",
      htmlSource: prev.htmlSource.trim() ? prev.htmlSource : classicCertificateHtml(),
    }));
  }

  async function save() {
    setError(null);
    setInfo(null);
    setSaving(true);
    const res = await apiPatch(`/api/tenant/certificates/${id}`, {
      name: name.trim(),
      contentJson: design,
    });
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

  const isHtml = design.mode === "html";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-64 flex-1">
            <FormField label="Certificate name (internal)" htmlFor="c-name">
              <TextInput
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canWrite}
              />
            </FormField>
          </div>
          {canWrite ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={isHtml ? "outline" : "default"}
                onClick={() => set("mode", "fields")}
              >
                Simple
              </Button>
              <Button
                type="button"
                variant={isHtml ? "default" : "outline"}
                onClick={switchToHtml}
              >
                HTML
              </Button>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {isHtml
            ? "The whole certificate as one HTML document. Your {{ variables }} are filled in per award, and the styles are scoped to the certificate."
            : "A fixed layout from a few fields. Switch to HTML when you need a real designed document — seals, signature lines, print rules."}
        </p>
      </Card>

      {isHtml ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h2 className="text-sm font-semibold uppercase text-stone-500">HTML source</h2>
            <p className="mt-1 text-xs text-stone-500">
              Type <code>{"{{"}</code> for the list of available variables.
            </p>
            <div className="mt-4">
              <CodeEditor
                value={design.htmlSource}
                onChange={(next) => set("htmlSource", next)}
                onSave={canWrite ? save : undefined}
                extraCompletion={completion}
                readOnly={!canWrite}
                height="32rem"
              />
            </div>
          </Card>
          <Card>
            <h2 className="text-sm font-semibold uppercase text-stone-500">Live preview</h2>
            <p className="mt-1 text-xs text-stone-500">
              Sample award data, your real branding. Scripts and unsafe markup are stripped when
              this is rendered for a learner.
            </p>
            <div className="mt-4">
              <SiteLivePreview source={design.htmlSource} context={previewContext} height={520} />
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-sm font-semibold uppercase text-stone-500">Design</h2>
            <p className="mt-1 text-xs text-stone-500">
              Placeholders: {"{{clientName}}"}, {"{{courseTitle}}"}, {"{{programmeTitle}}"},{" "}
              {"{{date}}"}, {"{{serial}}"}.
            </p>
            <div className="mt-4 flex flex-col gap-4">
              <FormField label="Title" htmlFor="d-title">
                <TextInput
                  id="d-title"
                  value={design.title}
                  onChange={(e) => set("title", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Subtitle" htmlFor="d-sub">
                <TextInput
                  id="d-sub"
                  value={design.subtitle}
                  onChange={(e) => set("subtitle", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Body" htmlFor="d-body">
                <TextArea
                  id="d-body"
                  value={design.bodyText}
                  onChange={(e) => set("bodyText", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Footer" htmlFor="d-foot">
                <TextInput
                  id="d-foot"
                  value={design.footerText}
                  onChange={(e) => set("footerText", e.target.value)}
                  disabled={!canWrite}
                />
              </FormField>
              <FormField label="Accent color" htmlFor="d-accent">
                <input
                  id="d-accent"
                  type="color"
                  value={design.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  disabled={!canWrite}
                  className="h-10 w-20 cursor-pointer rounded border-2 border-border"
                />
              </FormField>
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold uppercase text-stone-500">Live preview</h2>
            <div className="mt-4">
              <CertificateRender design={design} data={SAMPLE} />
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {info ? <p className="text-sm text-muted-foreground">{info}</p> : null}
          {canWrite ? (
            <div className="ml-auto flex gap-3">
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="destructive" onClick={onDelete}>
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

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
            <Button type="button" onClick={issue}>
              Issue
            </Button>
          </div>
        ) : null}
        {awards.length === 0 ? (
          <p className="mt-4 text-sm text-stone-600">No awards issued yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {awards.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-[10px] border-2 border-border bg-background px-3 py-2 text-sm"
              >
                <span className="font-semibold text-foreground">{a.client}</span>
                <span className="text-xs text-muted-foreground">
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

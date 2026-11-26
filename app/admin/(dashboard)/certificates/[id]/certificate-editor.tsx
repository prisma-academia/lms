"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { autocompletion } from "@codemirror/autocomplete";
import { apiPatch, apiPost, apiDelete } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/shell";
import { FormField, TextInput, TextArea, SelectInput } from "@/components/form-field";
import { CertificateRender } from "@/components/certificate-render";
import { AssistPanel, type AssistMode, type AssistOutcome } from "@/components/ai/assist-panel";
import type { CodeEditorHandle } from "@/components/code-editor";
import { variableCompletion } from "@/lib/site/variable-completion";
import {
  CERTIFICATE_VARIABLES,
  SAMPLE_AWARD_DATE,
  certificateSampleContext,
} from "@/lib/certificates/variables";
import type { CertificateDesign } from "@/lib/certificates/design";
// Types only: the designer itself (and the sanitizer it uses) stays on the server.
import type { CertificateDesignRequest, CertificateReport } from "@/lib/certificates/ai";
import type { CertificateOrientation } from "@/lib/certificates/ai-guide";
import type { ScopedHtml } from "@/lib/content/sanitize-html";
import type { VariableContext } from "@/lib/site/template";
import { LiveCertificatePreview, ScaledCertificate } from "./certificate-preview";
import { TemplateGallery, type GalleryTemplate } from "./template-gallery";
import { VariablePanel } from "./variable-panel";

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

/** `issuedLabel` is formatted on the server, in the academy's locale: formatting a date here would give one answer on the server and another in the browser. */
export type AwardRow = { id: string; serial: string; client: string; issuedLabel: string };
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
  // A fixed string, not a formatted Date: this renders on the server and again
  // in the browser, and the two do not agree on a locale.
  date: SAMPLE_AWARD_DATE,
  serial: "CERT-XXXXXXXXXX",
};

/** Must match MAX_REVISE_SOURCE_CHARS in lib/certificates/ai.ts (the server enforces it). */
const MAX_REVISE_CHARS = 40_000;

/** What the generate route sends back. */
type DesignResponse = {
  html: string;
  preview: ScopedHtml;
  report: CertificateReport;
  attempts: number;
};

const CREATE_EXAMPLES = [
  "Finishing our 12-week welding course. Traditional and formal, with two signature lines.",
  "A one-day workshop attendance certificate. Modern, plenty of white space, nothing ornate.",
  "Graduating from a professional diploma programme. Dignified, with a seal and a serif typeface.",
];

const REVISE_EXAMPLES = [
  "Make the learner's name larger and set it in italics.",
  "Change the title to “Certificate of Achievement”.",
  "Add a second signature line labelled “Programme director”.",
];

const SECTION_TITLE = "text-sm font-bold uppercase tracking-wide text-muted-foreground";

export function CertificateEditor({
  id,
  name: initialName,
  design: initialDesign,
  awards,
  clients,
  canWrite,
  branding,
  templates,
  aiReady,
}: {
  id: string;
  name: string;
  design: CertificateDesign;
  awards: AwardRow[];
  clients: Option[];
  canWrite: boolean;
  branding: TenantBranding;
  /** The built-in designs, already rendered for the gallery. */
  templates: GalleryTemplate[];
  /** False when no AI provider is configured on this platform. */
  aiReady: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const uid = useId();
  const [name, setName] = useState(initialName);
  const [design, setDesign] = useState<CertificateDesign>(initialDesign);
  const [issueClient, setIssueClient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /** What a design or an AI result replaced, so one press brings it back. */
  const [replaced, setReplaced] = useState<{ html: string; by: string } | null>(null);

  // The rest of an AI brief. The panel owns the sentence; these are ours.
  const [style, setStyle] = useState("");
  const [colours, setColours] = useState("");
  const [orientation, setOrientation] = useState<CertificateOrientation>("landscape");

  const editorRef = useRef<CodeEditorHandle>(null);

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
    // The first built-in design is the classic one. It arrives with the page
    // rather than being imported here, so the designs' markup is not also
    // shipped inside this component's bundle.
    const starter = templates[0]?.html ?? "";
    setDesign((prev) => ({
      ...prev,
      mode: "html",
      htmlSource: prev.htmlSource.trim() ? prev.htmlSource : starter,
    }));
  }

  /**
   * Replace the certificate's HTML with a design or an AI result.
   *
   * Never saves, and never throws work away: what was there is kept so "Undo"
   * can bring it back. The code editor also records the replacement as a single
   * change, so Ctrl+Z inside it does the same thing.
   */
  function replaceSource(next: string, by: string) {
    setReplaced({ html: design.htmlSource, by });
    setDesign((prev) => ({ ...prev, mode: "html", htmlSource: next }));
    setError(null);
    setInfo(null);
  }

  function undoReplace() {
    if (!replaced) return;
    set("htmlSource", replaced.html);
    setReplaced(null);
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
    toast("Certificate saved");
    setReplaced(null);
    router.refresh();
  }

  async function issue() {
    if (!issueClient) return setError("Choose a learner to award the certificate to.");
    setError(null);
    setIssuing(true);
    const res = await apiPost(`/api/tenant/certificates/${id}/awards`, { clientId: issueClient });
    setIssuing(false);
    if (res.error) return setError(res.error.message);
    setInfo("Certificate awarded.");
    toast("Certificate awarded");
    setIssueClient("");
    router.refresh();
  }

  async function onDelete() {
    const yes = await confirm({
      title: `Delete “${name.trim() || initialName}”?`,
      description:
        awards.length > 0
          ? `The certificate and the ${awards.length} ${awards.length === 1 ? "award" : "awards"} already given to learners are deleted. Those learners lose it. This cannot be undone.`
          : "The certificate is deleted. This cannot be undone.",
      confirmLabel: "Delete certificate",
      destructive: true,
    });
    if (!yes) return;
    setDeleting(true);
    const res = await apiDelete(`/api/tenant/certificates/${id}`);
    setDeleting(false);
    if (res.error) return setError(res.error.message);
    toast("Certificate deleted");
    router.push("/admin/certificates");
  }

  /** Ask the server for a design. Returns an outcome; never throws. */
  async function requestDesign({
    mode,
    prompt,
  }: {
    mode: AssistMode;
    prompt: string;
  }): Promise<AssistOutcome<DesignResponse>> {
    const request: CertificateDesignRequest =
      mode === "create"
        ? {
            mode: "create",
            occasion: prompt,
            style: style.trim() || null,
            colours: colours.trim() || null,
            orientation,
          }
        : { mode: "revise", instruction: prompt, currentHtml: design.htmlSource };

    const res = await apiPost<DesignResponse>(`/api/tenant/certificates/${id}/generate`, {
      request,
      accentColor: design.accentColor,
    });
    if (res.error || !res.data) {
      const status = res.status ?? 0;
      return {
        ok: false,
        message: res.error?.message ?? "The design could not be made. Please try again.",
        // Our own limits and bad requests will not go differently on a retry.
        retryable: status === 0 || status >= 500 || res.error?.code === "ai_rate_limited",
      };
    }
    return {
      ok: true,
      value: res.data,
      notes: res.data.report.issues.map((issue) => ({ severity: issue.severity, message: issue.message })),
      blocked: res.data.report.blocked,
    };
  }

  const isHtml = design.mode === "html";
  const hasSource = design.htmlSource.trim().length > 0;
  const reviseUnavailable = !hasSource
    ? "There is no certificate to change yet — start with a new design."
    : design.htmlSource.length > MAX_REVISE_CHARS
      ? "This certificate's HTML is too long to change with AI. Edit it by hand, or start a new design."
      : null;

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
                aria-pressed={!isHtml}
                onClick={() => set("mode", "fields")}
              >
                Simple
              </Button>
              <Button
                type="button"
                variant={isHtml ? "default" : "outline"}
                aria-pressed={isHtml}
                onClick={switchToHtml}
              >
                HTML
              </Button>
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          {isHtml
            ? "The whole certificate as one HTML document. Your {{ variables }} are filled in per award, and the styles are scoped to the certificate."
            : "A fixed layout from a few fields. Switch to HTML for a designed document: choose from ready-made designs, have AI design one for you, or write your own."}
        </p>
      </Card>

      {isHtml ? (
        <>
          <Card>
            <TemplateGallery
              templates={templates}
              currentSource={design.htmlSource}
              canWrite={canWrite}
              onUse={(template) => replaceSource(template.html, `the ${template.name} design`)}
            />
          </Card>

          {canWrite ? (
            <Card>
              <AssistPanel<DesignResponse>
                title="Design with AI"
                description="Describe the certificate and AI writes the HTML for it. You see the result first; it only replaces your certificate if you apply it, and it is only saved when you save."
                modes={{
                  create: {
                    label: "New design",
                    promptLabel: "What is this certificate for?",
                    placeholder: "e.g. Completing our six-month bookkeeping programme",
                    examples: CREATE_EXAMPLES,
                    submitLabel: "Design certificate",
                    busyLabel: "Designing your certificate…",
                  },
                  revise: {
                    label: "Change this one",
                    promptLabel: "What should change?",
                    placeholder: "e.g. Move the logo to the top left and make the border thinner",
                    examples: REVISE_EXAMPLES,
                    submitLabel: "Make the change",
                    busyLabel: "Reworking your certificate…",
                    unavailable: reviseUnavailable,
                  },
                }}
                submit={requestDesign}
                disabledReason={
                  aiReady
                    ? null
                    : "AI features are not set up for this platform yet. You can still use the designs above or write the HTML yourself."
                }
                busyHint="This usually takes under a minute. You can keep working — nothing changes until you apply the result."
                applyLabel="Use this design"
                appliedMessage="It is in the editor below. It is not saved until you press Save."
                onApply={(value, mode) =>
                  replaceSource(value.html, mode === "create" ? "the AI design" : "the AI's changes")
                }
                renderPreview={(value) => (
                  <div className="mx-auto max-w-2xl">
                    <ScaledCertificate
                      preview={value.preview}
                      label="The certificate AI designed, shown with sample details"
                    />
                    <p className="mt-2 text-xs font-medium text-muted-foreground">
                      Shown exactly as a learner would see it, with sample details and your branding.
                    </p>
                  </div>
                )}
                renderFields={(mode, disabled) =>
                  mode === "create" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField label="Style and tone (optional)" htmlFor={`${uid}-style`}>
                        <TextInput
                          id={`${uid}-style`}
                          value={style}
                          maxLength={600}
                          disabled={disabled}
                          onChange={(e) => setStyle(e.target.value)}
                          placeholder="e.g. Formal and traditional"
                        />
                      </FormField>
                      <FormField
                        label="Colours (optional)"
                        htmlFor={`${uid}-colours`}
                        hint="Your accent colour is used automatically."
                      >
                        <TextInput
                          id={`${uid}-colours`}
                          value={colours}
                          maxLength={400}
                          disabled={disabled}
                          onChange={(e) => setColours(e.target.value)}
                          placeholder="e.g. Deep green with a touch of gold"
                        />
                      </FormField>
                      <div className="flex flex-col gap-1.5">
                        <span id={`${uid}-orientation`} className="text-[13px] font-bold text-foreground">
                          Paper
                        </span>
                        <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
                          <Segmented
                            ariaLabel="Paper orientation"
                            value={orientation}
                            onChange={setOrientation}
                            options={[
                              { value: "landscape", label: "Landscape" },
                              { value: "portrait", label: "Portrait" },
                            ]}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null
                }
              />
            </Card>
          ) : null}

          {replaced ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border-2 border-border bg-muted px-4 py-3"
            >
              <p className="min-w-0 flex-1 basis-64 text-sm font-medium text-foreground">
                The editor now holds {replaced.by}. It is not saved until you press Save.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={undoReplace}>
                Undo — bring back what was there
              </Button>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <h2 className={SECTION_TITLE}>HTML source</h2>
              <p className="mt-1 text-xs font-medium text-muted-foreground">
                Type <code>{"{{"}</code> for the list of available variables, or pick one below.
              </p>
              <div className="mt-4">
                <CodeEditor
                  ref={editorRef}
                  value={design.htmlSource}
                  onChange={(next) => set("htmlSource", next)}
                  onSave={canWrite ? save : undefined}
                  extraCompletion={completion}
                  readOnly={!canWrite}
                  height="32rem"
                />
              </div>
              <div className="mt-5 border-t-2 border-dashed border-border pt-4">
                <VariablePanel
                  variables={CERTIFICATE_VARIABLES}
                  canInsert={canWrite}
                  onInsert={(text) => editorRef.current?.insert(text)}
                />
              </div>
            </Card>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className={SECTION_TITLE}>Live preview</h2>
                  <p className="mt-1 max-w-prose text-xs font-medium text-muted-foreground">
                    Sample award data, your real branding. This is exactly what a learner gets:
                    anything not allowed on a certificate is already left out.
                  </p>
                </div>
                <label
                  htmlFor={`${uid}-accent`}
                  className="flex shrink-0 items-center gap-2 text-[13px] font-bold text-foreground"
                >
                  Accent colour
                  <input
                    id={`${uid}-accent`}
                    type="color"
                    value={design.accentColor}
                    onChange={(e) => set("accentColor", e.target.value)}
                    disabled={!canWrite}
                    className="h-9 w-14 cursor-pointer rounded-[8px] border-2 border-border bg-card disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              </div>
              <div className="mt-4">
                <LiveCertificatePreview
                  source={design.htmlSource}
                  context={previewContext}
                  scopeId={`cert-live-${id}`}
                />
              </div>
            </Card>
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className={SECTION_TITLE}>Design</h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
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
              <FormField label="Accent colour" htmlFor="d-accent">
                <input
                  id="d-accent"
                  type="color"
                  value={design.accentColor}
                  onChange={(e) => set("accentColor", e.target.value)}
                  disabled={!canWrite}
                  className="h-10 w-20 cursor-pointer rounded-[8px] border-2 border-border bg-card outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </FormField>
            </div>
          </Card>

          <Card>
            <h2 className={SECTION_TITLE}>Live preview</h2>
            <div className="mt-4">
              <CertificateRender design={design} data={SAMPLE} />
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          {error ? (
            <p role="alert" className="text-sm font-bold text-destructive">
              {error}
            </p>
          ) : null}
          {info ? (
            <p role="status" className="text-sm font-medium text-muted-foreground">
              {info}
            </p>
          ) : null}
          {canWrite ? (
            // Delete first in the row and Save last: the primary action sits at
            // the edge the eye and the thumb end on, the destructive one apart.
            <div className="ml-auto flex flex-wrap gap-3">
              <Button type="button" variant="destructive" onClick={onDelete} disabled={saving || deleting}>
                {deleting ? "Deleting…" : "Delete certificate"}
              </Button>
              <Button type="button" onClick={save} disabled={saving || deleting}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className={SECTION_TITLE}>Awards ({awards.length})</h2>
        {canWrite ? (
          <div className="mt-3 flex max-w-xl flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1 basis-56">
              <FormField label="Award it to a learner" htmlFor="issue-client">
                <SelectInput
                  id="issue-client"
                  placeholder="Choose a learner…"
                  options={clients}
                  value={issueClient}
                  onChange={(e) => setIssueClient(e.target.value)}
                />
              </FormField>
            </div>
            <Button type="button" onClick={issue} disabled={issuing}>
              {issuing ? "Awarding…" : "Award certificate"}
            </Button>
          </div>
        ) : null}
        {awards.length === 0 ? (
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            Nobody has been awarded this certificate yet. If it is linked to a course or programme,
            learners receive it automatically when they finish.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {awards.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[10px] border-2 border-border bg-background px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-words font-bold text-foreground">{a.client}</span>
                <span className="num text-xs text-muted-foreground">
                  {a.serial} · {a.issuedLabel}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

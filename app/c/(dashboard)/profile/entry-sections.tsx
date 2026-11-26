"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/icon";
import {
  PROFILE_LIMITS,
  certificationEntrySchema,
  educationEntrySchema,
  experienceEntrySchema,
  fieldErrors,
  formatMonth,
  formatMonthRange,
  formatYearRange,
  type CertificationEntry,
  type EducationEntry,
  type ExperienceEntry,
} from "@/lib/schemas/client-profile";
import { formatBytes } from "@/lib/client/image-upload";
import {
  EmptyNote,
  EntryActions,
  FormActions,
  FormPanel,
  MonthField,
  SectionCard,
  TextAreaField,
  TextField,
  YearField,
  isOpen,
  orEmpty,
  useDraft,
  useProfileEditor,
  type IssuedCertificate,
} from "./profile-ui";
import { DOCUMENT_ACCEPT, documentProblem, uploadDocument } from "./profile-upload";

/** The id an unsaved entry's form is opened under. */
const NEW = "new";

/** Said in place of the Add button once a list is full, so its absence is explained. */
function LimitNote({ max, noun }: { max: number; noun: string }) {
  return (
    <p className="text-[13px] font-medium text-muted-foreground">
      You&rsquo;ve listed {max} {noun}, which is the most a profile holds. Remove one to add another.
    </p>
  );
}

/** `list` with `entry` put in place of the one it replaces, or added. */
function withEntry<T extends { id: string }>(list: T[], entry: T, replacing: string | null): T[] {
  return replacing ? list.map((existing) => (existing.id === replacing ? entry : existing)) : [...list, entry];
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      <Icon name="plus" aria-hidden />
      {children}
    </Button>
  );
}

/**
 * Entries down a rule, newest first. Experience and education are sequences in
 * time, and the rule is what says so — it is not there for decoration.
 */
function Timeline({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col">{children}</ol>;
}

function TimelineItem({ last, children }: { last: boolean; children: ReactNode }) {
  return (
    <li className="relative flex gap-3.5 pb-5 last:pb-0">
      <span aria-hidden className="relative mt-1.5 flex w-3 shrink-0 justify-center">
        <span className="z-[1] size-3 rounded-full border-2 border-border bg-primary" />
        {/* Runs from under this marker to the top of the next one. */}
        {last ? null : <span className="absolute top-3 h-[calc(100%+0.875rem)] w-0.5 bg-border" />}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/* -------------------------------------------------------------------------- */
/* Experience                                                                  */
/* -------------------------------------------------------------------------- */

function ExperienceForm({ entry }: { entry: ExperienceEntry | null }) {
  const { profile, save } = useProfileEditor();
  const currentId = useId();
  const { values, set, setValues, dirty } = useDraft({
    title: entry?.title ?? "",
    organisation: entry?.organisation ?? "",
    location: orEmpty(entry?.location),
    start: entry?.start ?? "",
    end: orEmpty(entry?.end),
    current: entry?.current ?? false,
    description: orEmpty(entry?.description),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    const parsed = experienceEntrySchema.safeParse({ ...values, id: entry?.id });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError("Some details need another look. They are marked above.");
      return;
    }
    setErrors({});
    setFormError(null);
    const result = await save(
      { section: "experience", value: withEntry(profile.experience, parsed.data, entry?.id ?? null) },
      entry ? "Role updated." : "Role added."
    );
    if (!result.ok) setFormError(result.message);
  }

  return (
    <FormPanel title={entry ? "Edit this role" : "Add a role"} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Job title"
          value={values.title}
          onChange={(v) => set("title", v)}
          error={errors.title}
          max={PROFILE_LIMITS.title}
          autoComplete="organization-title"
          autoFocus
        />
        <TextField
          label="Organisation"
          value={values.organisation}
          onChange={(v) => set("organisation", v)}
          error={errors.organisation}
          max={PROFILE_LIMITS.organisation}
          autoComplete="organization"
        />
      </div>
      <TextField
        label="Location"
        optional
        placeholder="City, country, or Remote"
        value={values.location}
        onChange={(v) => set("location", v)}
        error={errors.location}
        max={PROFILE_LIMITS.location}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <MonthField label="Started" value={values.start} onChange={(v) => set("start", v)} error={errors.start} />
        <MonthField
          label="Ended"
          value={values.current ? "" : values.end}
          onChange={(v) => set("end", v)}
          disabled={values.current}
          error={values.current ? undefined : errors.end}
        />
      </div>
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={currentId}
          checked={values.current}
          // A current role has no end date, so ticking this clears one.
          onCheckedChange={(checked) =>
            setValues((v) => ({ ...v, current: checked === true, end: checked === true ? "" : v.end }))
          }
        />
        <label htmlFor={currentId} className="text-sm font-medium">
          I work here now
        </label>
      </div>
      <TextAreaField
        label="What you did"
        optional
        hint="Responsibilities, results, tools you used."
        value={values.description}
        onChange={(v) => set("description", v)}
        error={errors.description}
        max={PROFILE_LIMITS.description}
      />
      <FormActions dirty={dirty} error={formError} saveLabel={entry ? "Save role" : "Add role"} />
    </FormPanel>
  );
}

export function ExperienceSection() {
  const { profile, open, requestOpen, save } = useProfileEditor();
  const entries = profile.experience;
  const adding = isOpen(open, "experience", NEW);
  const full = entries.length >= PROFILE_LIMITS.experience;

  return (
    <SectionCard
      section="experience"
      title="Experience"
      action={
        adding || full ? null : (
          <AddButton onClick={() => requestOpen({ section: "experience", entryId: NEW })}>Add a role</AddButton>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {full ? <LimitNote max={PROFILE_LIMITS.experience} noun="roles" /> : null}
        {adding ? <ExperienceForm entry={null} /> : null}

        {entries.length === 0 && !adding ? (
          <EmptyNote>
            Add the jobs, internships and volunteering you have done. It tells your instructors what
            you already know, and it is the first thing an employer looks for.
          </EmptyNote>
        ) : null}

        {entries.length > 0 ? (
          <Timeline>
            {entries.map((entry, index) => (
              <TimelineItem key={entry.id} last={index === entries.length - 1}>
                {isOpen(open, "experience", entry.id) ? (
                  <ExperienceForm entry={entry} />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-heading text-[15px] leading-snug">{entry.title}</p>
                      <p className="text-sm font-medium text-foreground">
                        {entry.organisation}
                        {entry.location ? <span className="text-muted-foreground">, {entry.location}</span> : null}
                      </p>
                      <p className="num mt-0.5 flex flex-wrap items-center gap-2 text-[13px] font-bold text-muted-foreground">
                        {formatMonthRange(entry.start, entry.end, entry.current)}
                        {entry.current ? <Badge color="var(--success)">Current</Badge> : null}
                      </p>
                      {entry.description ? (
                        <p className="mt-2 max-w-prose whitespace-pre-line text-sm font-medium leading-relaxed text-foreground">
                          {entry.description}
                        </p>
                      ) : null}
                    </div>
                    <EntryActions
                      label={`${entry.title} at ${entry.organisation}`}
                      onEdit={() => requestOpen({ section: "experience", entryId: entry.id })}
                      onRemove={async () => {
                        await save(
                          { section: "experience", value: entries.filter((e) => e.id !== entry.id) },
                          "Role removed.",
                          { keepOpen: true }
                        );
                      }}
                    />
                  </div>
                )}
              </TimelineItem>
            ))}
          </Timeline>
        ) : null}
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Education                                                                   */
/* -------------------------------------------------------------------------- */

function EducationForm({ entry }: { entry: EducationEntry | null }) {
  const { profile, save } = useProfileEditor();
  const { values, set, dirty } = useDraft({
    school: entry?.school ?? "",
    qualification: orEmpty(entry?.qualification),
    field: orEmpty(entry?.field),
    startYear: orEmpty(entry?.startYear),
    endYear: orEmpty(entry?.endYear),
    description: orEmpty(entry?.description),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function submit() {
    const parsed = educationEntrySchema.safeParse({ ...values, id: entry?.id });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError("Some details need another look. They are marked above.");
      return;
    }
    setErrors({});
    setFormError(null);
    const result = await save(
      { section: "education", value: withEntry(profile.education, parsed.data, entry?.id ?? null) },
      entry ? "Education updated." : "Education added."
    );
    if (!result.ok) setFormError(result.message);
  }

  return (
    <FormPanel title={entry ? "Edit this entry" : "Add education"} onSubmit={submit}>
      <TextField
        label="School or institution"
        value={values.school}
        onChange={(v) => set("school", v)}
        error={errors.school}
        max={PROFILE_LIMITS.school}
        autoFocus
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Qualification"
          optional
          placeholder="BSc, HND, WASSCE…"
          value={values.qualification}
          onChange={(v) => set("qualification", v)}
          error={errors.qualification}
          max={PROFILE_LIMITS.qualification}
        />
        <TextField
          label="Field of study"
          optional
          value={values.field}
          onChange={(v) => set("field", v)}
          error={errors.field}
          max={PROFILE_LIMITS.field}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <YearField
          label="Started"
          value={values.startYear}
          onChange={(v) => set("startYear", v)}
          error={errors.startYear}
        />
        <YearField
          label="Finished"
          hint="If you are still studying, the year you expect to finish."
          value={values.endYear}
          onChange={(v) => set("endYear", v)}
          error={errors.endYear}
          yearsAhead={8}
        />
      </div>
      <TextAreaField
        label="Notes"
        optional
        hint="Grade, honours, societies, a thesis title."
        value={values.description}
        onChange={(v) => set("description", v)}
        error={errors.description}
        max={PROFILE_LIMITS.description}
        rows={3}
      />
      <FormActions dirty={dirty} error={formError} saveLabel={entry ? "Save entry" : "Add education"} />
    </FormPanel>
  );
}

export function EducationSection() {
  const { profile, open, requestOpen, save } = useProfileEditor();
  const entries = profile.education;
  const adding = isOpen(open, "education", NEW);
  const full = entries.length >= PROFILE_LIMITS.education;

  return (
    <SectionCard
      section="education"
      title="Education"
      action={
        adding || full ? null : (
          <AddButton onClick={() => requestOpen({ section: "education", entryId: NEW })}>Add education</AddButton>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {full ? <LimitNote max={PROFILE_LIMITS.education} noun="schools" /> : null}
        {adding ? <EducationForm entry={null} /> : null}

        {entries.length === 0 && !adding ? (
          <EmptyNote>
            Add the schools, colleges and universities you have attended, including one you are at
            now. Courses here can build on what you have already studied.
          </EmptyNote>
        ) : null}

        {entries.length > 0 ? (
          <Timeline>
            {entries.map((entry, index) => {
              const award = [entry.qualification, entry.field].filter(Boolean).join(", ");
              const years = formatYearRange(entry.startYear, entry.endYear);
              return (
                <TimelineItem key={entry.id} last={index === entries.length - 1}>
                  {isOpen(open, "education", entry.id) ? (
                    <EducationForm entry={entry} />
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="font-heading text-[15px] leading-snug">{entry.school}</p>
                        {award ? <p className="text-sm font-medium text-foreground">{award}</p> : null}
                        {years ? (
                          <p className="num mt-0.5 text-[13px] font-bold text-muted-foreground">{years}</p>
                        ) : null}
                        {entry.description ? (
                          <p className="mt-2 max-w-prose whitespace-pre-line text-sm font-medium leading-relaxed text-foreground">
                            {entry.description}
                          </p>
                        ) : null}
                      </div>
                      <EntryActions
                        label={entry.school}
                        onEdit={() => requestOpen({ section: "education", entryId: entry.id })}
                        onRemove={async () => {
                          await save(
                            { section: "education", value: entries.filter((e) => e.id !== entry.id) },
                            "Education removed.",
                            { keepOpen: true }
                          );
                        }}
                      />
                    </div>
                  )}
                </TimelineItem>
              );
            })}
          </Timeline>
        ) : null}
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Certifications                                                              */
/* -------------------------------------------------------------------------- */

function CertificationForm({ entry }: { entry: CertificationEntry | null }) {
  const { profile, save, uploadsEnabled } = useProfileEditor();
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const { values, set, dirty } = useDraft({
    name: entry?.name ?? "",
    issuer: entry?.issuer ?? "",
    issued: orEmpty(entry?.issued),
    expires: orEmpty(entry?.expires),
    credentialId: orEmpty(entry?.credentialId),
    credentialUrl: orEmpty(entry?.credentialUrl),
    proofKey: orEmpty(entry?.proofKey),
    // A stand-in for the chosen file, so picking one counts as a change.
    pendingFile: "",
  });
  // The file itself. It is sent when the form is saved, not when it is picked:
  // a document uploaded for a form that is then cancelled would be left in
  // storage with nothing pointing at it.
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function pick(chosen: File | null) {
    setFileError(null);
    if (!chosen) return;
    const problem = documentProblem(chosen);
    if (problem) {
      setFileError(problem);
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setFile(chosen);
    set("pendingFile", `${chosen.name}:${chosen.size}`);
  }

  function clearFile() {
    setFile(null);
    setFileError(null);
    set("pendingFile", "");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit() {
    const draft = certificationEntrySchema.safeParse({
      id: entry?.id,
      name: values.name,
      issuer: values.issuer,
      issued: values.issued,
      expires: values.expires,
      credentialId: values.credentialId,
      credentialUrl: values.credentialUrl,
      proofKey: values.proofKey,
    });
    if (!draft.success) {
      setErrors(fieldErrors(draft.error));
      setFormError("Some details need another look. They are marked above.");
      return;
    }
    setErrors({});
    setFormError(null);

    let proofKey = draft.data.proofKey;
    if (file) {
      setUploading(true);
      const uploaded = await uploadDocument(file);
      setUploading(false);
      if (!uploaded.ok) {
        setFileError(uploaded.message);
        setFormError("The proof document could not be uploaded, so nothing was saved.");
        return;
      }
      proofKey = uploaded.key;
      // Held as the entry's key from here on: if the save below fails and is
      // tried again, the file is not sent a second time.
      set("proofKey", uploaded.key);
      clearFile();
    }

    const result = await save(
      {
        section: "certifications",
        value: withEntry(profile.certifications, { ...draft.data, proofKey }, entry?.id ?? null),
      },
      entry ? "Certification updated." : "Certification added."
    );
    if (!result.ok) setFormError(result.message);
  }

  return (
    <FormPanel title={entry ? "Edit this certification" : "Add a certification"} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Certification"
          placeholder="AWS Certified Solutions Architect"
          value={values.name}
          onChange={(v) => set("name", v)}
          error={errors.name}
          max={PROFILE_LIMITS.certificationName}
          autoFocus
        />
        <TextField
          label="Issued by"
          placeholder="Amazon Web Services"
          value={values.issuer}
          onChange={(v) => set("issuer", v)}
          error={errors.issuer}
          max={PROFILE_LIMITS.issuer}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MonthField label="Issued" optional value={values.issued} onChange={(v) => set("issued", v)} error={errors.issued} />
        <MonthField
          label="Expires"
          optional
          hint="Leave empty if it does not expire."
          value={values.expires}
          onChange={(v) => set("expires", v)}
          error={errors.expires}
          yearsAhead={15}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Credential ID"
          optional
          value={values.credentialId}
          onChange={(v) => set("credentialId", v)}
          error={errors.credentialId}
          max={PROFILE_LIMITS.credentialId}
        />
        <TextField
          label="Verification link"
          optional
          type="url"
          inputMode="url"
          hint="Where someone can check it with the issuer. https only."
          value={values.credentialUrl}
          onChange={(v) => set("credentialUrl", v)}
          error={errors.credentialUrl}
        />
      </div>

      {uploadsEnabled ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="text-[13px] font-bold text-foreground">
            Proof <span className="font-medium text-muted-foreground">(optional)</span>
          </label>
          {file ? (
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <Icon name="file" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 break-all">{file.name}</span>
              <span className="num text-muted-foreground">{formatBytes(file.size)}</span>
              <Button type="button" size="xs" variant="outline" onClick={clearFile}>
                Remove
              </Button>
            </p>
          ) : values.proofKey ? (
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <Icon name="check-circle" className="size-4 shrink-0 text-success" aria-hidden />
              A document is attached.
              <Button type="button" size="xs" variant="outline" onClick={() => set("proofKey", "")}>
                Remove it
              </Button>
            </p>
          ) : null}
          <input
            ref={fileInput}
            id={fileId}
            type="file"
            accept={DOCUMENT_ACCEPT}
            aria-describedby={`${fileId}-hint${fileError ? ` ${fileId}-error` : ""}`}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
            className="block w-full max-w-md cursor-pointer rounded-[10px] border-2 border-dashed border-border bg-card text-sm font-medium text-muted-foreground file:mr-3 file:cursor-pointer file:border-0 file:border-r-2 file:border-border file:bg-muted file:px-3 file:py-2 file:text-sm file:font-bold file:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {fileError ? (
            <p id={`${fileId}-error`} role="alert" className="text-xs font-bold text-destructive">
              {fileError}
            </p>
          ) : null}
          <p id={`${fileId}-hint`} className="text-xs font-medium text-muted-foreground">
            A scan or PDF of the certificate, up to 5 MB. Only you and the academy&rsquo;s staff can
            open it.{values.proofKey && !file ? " Choosing a file replaces the one attached." : ""}
          </p>
        </div>
      ) : null}

      <FormActions
        dirty={dirty}
        error={formError}
        busy={uploading}
        busyLabel={uploading ? "Uploading proof…" : "Saving…"}
        saveLabel={entry ? "Save certification" : "Add certification"}
      />
    </FormPanel>
  );
}

export function CertificationsSection({ issued }: { issued: IssuedCertificate[] }) {
  const { profile, open, requestOpen, save } = useProfileEditor();
  const entries = profile.certifications;
  const adding = isOpen(open, "certifications", NEW);
  const full = entries.length >= PROFILE_LIMITS.certifications;

  return (
    <SectionCard
      section="certifications"
      title="Certifications"
      action={
        adding || full ? null : (
          <AddButton onClick={() => requestOpen({ section: "certifications", entryId: NEW })}>
            Add a certification
          </AddButton>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {full ? <LimitNote max={PROFILE_LIMITS.certifications} noun="certifications" /> : null}
        {adding ? <CertificationForm entry={null} /> : null}

        {issued.length > 0 ? (
          <div>
            <h3 className="text-[13px] font-bold text-muted-foreground">Earned here</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {issued.map((certificate) => (
                <li key={certificate.id}>
                  <Link
                    href={`/certificates/${certificate.id}`}
                    className="group/cert flex h-full items-start gap-2.5 rounded-[10px] border-2 border-border bg-background px-3 py-2.5 outline-none transition-transform hover:-translate-x-px hover:-translate-y-px hover:shadow-sm focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Icon name="award" className="mt-0.5 size-[18px] shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-foreground">{certificate.name}</span>
                      {certificate.earnedOn ? (
                        <span className="block text-[13px] font-medium text-muted-foreground">
                          {certificate.earnedOn}
                        </span>
                      ) : null}
                      <span className="num mt-0.5 block text-xs font-bold text-muted-foreground">
                        Issued {certificate.issuedLabel}, no. {certificate.serial}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {entries.length === 0 && !adding ? (
          <EmptyNote>
            {issued.length > 0
              ? "Add certifications you hold from anywhere else, such as a professional body or another training provider."
              : "Add certifications you hold, such as one from a professional body or another training provider. Certificates you earn here are added for you."}
          </EmptyNote>
        ) : null}

        {entries.length > 0 ? (
          <div>
            {issued.length > 0 ? (
              <h3 className="text-[13px] font-bold text-muted-foreground">From elsewhere</h3>
            ) : null}
            <ul className={issued.length > 0 ? "mt-2 flex flex-col gap-3" : "flex flex-col gap-3"}>
              {entries.map((entry) => {
                const dates =
                  entry.issued && entry.expires
                    ? `Issued ${formatMonth(entry.issued)}, expires ${formatMonth(entry.expires)}`
                    : entry.issued
                      ? `Issued ${formatMonth(entry.issued)}`
                      : entry.expires
                        ? `Expires ${formatMonth(entry.expires)}`
                        : "";
                return (
                  <li key={entry.id}>
                    {isOpen(open, "certifications", entry.id) ? (
                      <CertificationForm entry={entry} />
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-[10px] border-2 border-border bg-background px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="font-heading text-[15px] leading-snug">{entry.name}</p>
                          <p className="text-sm font-medium text-foreground">{entry.issuer}</p>
                          {dates ? (
                            <p className="num mt-0.5 text-[13px] font-bold text-muted-foreground">{dates}</p>
                          ) : null}
                          {entry.credentialId ? (
                            <p className="mt-0.5 break-all text-[13px] font-medium text-muted-foreground">
                              Credential ID {entry.credentialId}
                            </p>
                          ) : null}
                          {entry.credentialUrl || entry.proofKey ? (
                            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-bold">
                              {entry.credentialUrl ? (
                                <a
                                  href={entry.credentialUrl}
                                  target="_blank"
                                  rel="noopener noreferrer nofollow"
                                  className="inline-flex items-center gap-1 underline decoration-2 underline-offset-4 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                                >
                                  <Icon name="external-link" className="size-3.5" aria-hidden />
                                  Verify with the issuer
                                  <span className="sr-only">(opens in a new tab)</span>
                                </a>
                              ) : null}
                              {entry.proofKey ? (
                                <a
                                  href={`/api/client/profile/files?certification=${entry.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 underline decoration-2 underline-offset-4 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                                >
                                  <Icon name="file" className="size-3.5" aria-hidden />
                                  View proof
                                  <span className="sr-only">(opens in a new tab)</span>
                                </a>
                              ) : null}
                            </p>
                          ) : null}
                        </div>
                        <EntryActions
                          label={entry.name}
                          onEdit={() => requestOpen({ section: "certifications", entryId: entry.id })}
                          onRemove={async () => {
                            await save(
                              { section: "certifications", value: entries.filter((e) => e.id !== entry.id) },
                              "Certification removed.",
                              { keepOpen: true }
                            );
                          }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

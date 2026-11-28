"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { FormField, SelectInput, TextArea, TextInput } from "@/components/form-field";
import { MathText } from "@/components/assessments/math-text";
import { useSavedSnapshot, useUnsavedGuard } from "@/components/use-unsaved-guard";
import { DEFAULT_GRADE_BANDS, type ExamTools, type GradeBand } from "@/lib/exams/settings";
import type {
  ExamAccessModeValue,
  ExamCalculatorValue,
  ExamKindValue,
  ExamNavigationValue,
  ExamResultReleaseValue,
  ExamReviewModeValue,
} from "@/lib/exams/admin-dto";
import { fromZonedInput, toZonedInput } from "@/lib/exams/zoned-time";
import { useBuilder } from "./builder-context";
import { Notice, SectionHeading, ToggleRow, intOrNull } from "./ui";

const NAVIGATION_HELP: Record<ExamNavigationValue, string> = {
  FREE: "Candidates move freely between all questions and can change any answer until they submit.",
  LINEAR: "Forward only: once a candidate moves past a question they cannot go back to it.",
  SECTION_LOCKED: "Free inside a section; a section that has been left is closed for good.",
};

const RELEASE_HELP: Record<ExamResultReleaseValue, string> = {
  IMMEDIATE: "Candidates see their result as soon as they submit (once anything needing a marker is marked).",
  AFTER_CLOSE: "Results appear for everyone when the exam window closes.",
  MANUAL: "Results stay hidden until staff release them from the Results page.",
};

const TOOL_LABELS: Record<keyof ExamTools, { label: string; description: string }> = {
  palette: { label: "Question palette", description: "A grid of question numbers to jump around and see what is answered." },
  flagging: { label: "Flag for review", description: "Candidates can mark questions to come back to." },
  progress: { label: "Progress count", description: "Shows “answered / total”." },
  scratchpad: { label: "Scratchpad", description: "A notes area for working out. Never marked." },
  highlighter: { label: "Highlighter", description: "Highlight words in questions and passages." },
  eliminator: { label: "Option eliminator", description: "Strike out options the candidate has ruled out." },
  lineReader: { label: "Line reader", description: "A reading guide that follows the line — helps candidates with dyslexia." },
  textToSpeech: { label: "Read aloud", description: "The device reads questions aloud. Turn off for language or reading tests." },
};

type Form = {
  title: string;
  code: string;
  description: string;
  instructionsHtml: string;
  kind: ExamKindValue;
  courseId: string;
  durationMin: string;
  opensAt: string;
  closesAt: string;
  lateEntryMin: string;
  offlineGraceMin: string;
  attemptsAllowed: string;
  cooldownMin: string;
  navigation: ExamNavigationValue;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  passMark: string;
  negativeOn: boolean;
  negativePct: string;
  gradeBands: { min: string; label: string; remark: string }[];
  resultRelease: ExamResultReleaseValue;
  reviewMode: ExamReviewModeValue;
  calculator: ExamCalculatorValue;
  formulaSheetHtml: string;
  tools: ExamTools;
  accessMode: ExamAccessModeValue;
  accessCode: string;
  pinLogin: boolean;
  certificateId: string;
};

const bandsToForm = (bands: GradeBand[]) => bands.map((b) => ({ min: String(b.min), label: b.label, remark: b.remark }));

export function SettingsTab() {
  const { exam, reload, canWrite, courses, certificates, timeZone } = useBuilder();
  const router = useRouter();
  const { toast } = useToast();
  const [f, setF] = useState<Form>(() => ({
    title: exam.title,
    code: exam.code ?? "",
    description: exam.description ?? "",
    instructionsHtml: exam.instructionsHtml ?? "",
    kind: exam.kind,
    courseId: exam.courseId ?? "",
    durationMin: String(exam.durationMin),
    opensAt: toZonedInput(exam.opensAt, timeZone),
    closesAt: toZonedInput(exam.closesAt, timeZone),
    lateEntryMin: exam.lateEntryMin != null ? String(exam.lateEntryMin) : "",
    offlineGraceMin: String(exam.offlineGraceMin),
    attemptsAllowed: String(exam.attemptsAllowed),
    cooldownMin: exam.cooldownMin != null ? String(exam.cooldownMin) : "",
    navigation: exam.navigation,
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    passMark: String(exam.passMark),
    negativeOn: exam.negativeMarking != null,
    negativePct: exam.negativeMarking != null ? String(Math.round(exam.negativeMarking * 100)) : "25",
    gradeBands: bandsToForm(exam.gradeBands),
    resultRelease: exam.resultRelease,
    reviewMode: exam.reviewMode,
    calculator: exam.calculator,
    formulaSheetHtml: exam.formulaSheetHtml ?? "",
    tools: exam.tools,
    accessMode: exam.accessMode,
    accessCode: exam.accessCode ?? "",
    pinLogin: exam.pinLogin,
    certificateId: exam.certificateId ?? "",
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof Form | "form", string>>>({});
  const [saving, setSaving] = useState(false);
  const saved = useSavedSnapshot(f);
  useUnsavedGuard(canWrite && saved.dirty);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setF((prev) => ({ ...prev, [key]: value }));
  const disabled = !canWrite;

  function validate() {
    const e: typeof errors = {};
    if (!f.title.trim()) e.title = "Give the exam a title.";
    if (f.code.trim() && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(f.code.trim())) e.code = "Use letters, digits, - and _ only.";
    if (f.kind === "COURSE" && !f.courseId) e.courseId = "Choose the course, or make it standalone.";
    const dur = intOrNull(f.durationMin);
    if (dur == null || dur < 1 || dur > 1440) e.durationMin = "Between 1 and 1440 minutes.";
    const opens = f.opensAt ? fromZonedInput(f.opensAt, timeZone) : null;
    const closes = f.closesAt ? fromZonedInput(f.closesAt, timeZone) : null;
    if (opens && closes && closes <= opens) e.closesAt = "Must be after the opening time.";
    if (f.lateEntryMin.trim() && (intOrNull(f.lateEntryMin) ?? -1) < 0) e.lateEntryMin = "A whole number of minutes.";
    const grace = intOrNull(f.offlineGraceMin);
    if (grace == null || grace < 0 || grace > 60) e.offlineGraceMin = "From 0 to 60 minutes.";
    const att = intOrNull(f.attemptsAllowed);
    if (att == null || att < 1 || att > 20) e.attemptsAllowed = "From 1 to 20.";
    if (f.cooldownMin.trim() && (intOrNull(f.cooldownMin) ?? -1) < 0) e.cooldownMin = "A whole number of minutes.";
    const pass = intOrNull(f.passMark);
    if (pass == null || pass < 0 || pass > 100) e.passMark = "From 0 to 100.";
    if (f.negativeOn) {
      const n = intOrNull(f.negativePct);
      if (n == null || n < 1 || n > 100) e.negativePct = "From 1 to 100 percent.";
    }
    if (f.gradeBands.some((b) => !b.label.trim() || intOrNull(b.min) == null || intOrNull(b.min)! < 0 || intOrNull(b.min)! > 100)) {
      e.gradeBands = "Every band needs a label and a minimum from 0 to 100.";
    }
    if (f.accessMode === "ACCESS_CODE" && f.accessCode.trim().length < 4) e.accessCode = "Use at least 4 characters.";
    return e;
  }

  async function save() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      toast("Some settings need fixing — see the highlighted fields.");
      return;
    }
    setSaving(true);
    const res = await apiPatch(`/api/tenant/exams/${exam.id}`, {
      title: f.title.trim(),
      code: f.code.trim() || null,
      description: f.description.trim() || null,
      instructionsHtml: f.instructionsHtml.trim() || null,
      kind: f.kind,
      courseId: f.courseId || null,
      durationMin: intOrNull(f.durationMin),
      opensAt: f.opensAt ? fromZonedInput(f.opensAt, timeZone) : null,
      closesAt: f.closesAt ? fromZonedInput(f.closesAt, timeZone) : null,
      lateEntryMin: intOrNull(f.lateEntryMin),
      offlineGraceMin: intOrNull(f.offlineGraceMin),
      attemptsAllowed: intOrNull(f.attemptsAllowed),
      cooldownMin: intOrNull(f.cooldownMin),
      navigation: f.navigation,
      shuffleQuestions: f.shuffleQuestions,
      shuffleOptions: f.shuffleOptions,
      passMark: intOrNull(f.passMark),
      negativeMarking: f.negativeOn ? (intOrNull(f.negativePct) ?? 25) / 100 : null,
      gradeBandsJson: f.gradeBands.map((b) => ({ min: intOrNull(b.min) ?? 0, label: b.label.trim(), remark: b.remark.trim() })),
      resultRelease: f.resultRelease,
      reviewMode: f.reviewMode,
      calculator: f.calculator,
      formulaSheetHtml: f.formulaSheetHtml.trim() || null,
      toolsJson: f.tools,
      accessMode: f.accessMode,
      accessCode: f.accessCode.trim() || null,
      pinLogin: f.pinLogin,
      certificateId: f.certificateId || null,
    });
    setSaving(false);
    if (res.error) {
      if (res.error.code === "code_taken") setErrors({ code: res.error.message });
      else setErrors({ form: res.error.message });
      toast(res.error.message);
      return;
    }
    saved.markSaved();
    toast("Settings saved.");
    await reload();
    router.refresh();
  }

  const courseOptions = courses.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="flex flex-col gap-5 pb-20">
      {!canWrite ? <Notice>You can view these settings but not change them.</Notice> : null}

      <Card>
        <SectionHeading title="Details" />
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <FormField label="Title" htmlFor="s-title" error={errors.title} required>
              <TextInput id="s-title" value={f.title} disabled={disabled} maxLength={200} onChange={(e) => set("title", e.target.value)} />
            </FormField>
            <FormField label="Exam code" htmlFor="s-code" error={errors.code} hint="Starts each new Exam ID.">
              <TextInput id="s-code" value={f.code} disabled={disabled} maxLength={40} className="font-mono uppercase" onChange={(e) => set("code", e.target.value.toUpperCase())} />
            </FormField>
          </div>
          <FormField label="Description (optional)" htmlFor="s-desc" hint="For staff and the learner's exam list.">
            <TextArea id="s-desc" value={f.description} disabled={disabled} maxLength={2000} onChange={(e) => set("description", e.target.value)} />
          </FormField>
          <FormField
            label="Instructions to candidates"
            htmlFor="s-instr"
            hint="Shown in the lobby before the candidate starts. Plain text — a blank line starts a new paragraph, and maths between $ signs is rendered."
          >
            <TextArea id="s-instr" value={f.instructionsHtml} disabled={disabled} maxLength={20000} className="min-h-32" onChange={(e) => set("instructionsHtml", e.target.value)} />
          </FormField>
          {f.instructionsHtml.trim() ? (
            <div className="rounded-[10px] border-2 border-dashed border-border bg-background px-3 py-2.5 text-sm">
              <p className="mb-1 text-xs font-black uppercase text-muted-foreground">Preview</p>
              <MathText as="div">{f.instructionsHtml}</MathText>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-bold">Kind</span>
              <Segmented<ExamKindValue>
                ariaLabel="Kind of exam"
                options={[
                  { value: "STANDALONE", label: "Standalone" },
                  { value: "COURSE", label: "Course exam" },
                ]}
                value={f.kind}
                onChange={(v) => !disabled && set("kind", v)}
                className="self-start"
              />
            </div>
            <FormField
              label={f.kind === "COURSE" ? "Course" : "Linked course (optional)"}
              htmlFor="s-course"
              error={errors.courseId}
              hint="Needed to let a course's enrollees in, and to add the exam as a lesson."
            >
              <SelectInput id="s-course" placeholder="No course" options={courseOptions} value={f.courseId} disabled={disabled} onChange={(e) => set("courseId", e.target.value)} />
            </FormField>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Timing and window">Times are in the academy&apos;s time zone, {timeZone}.</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Duration (minutes)" htmlFor="s-dur" error={errors.durationMin} hint="Per candidate, from when they start. Extra time is added per candidate.">
            <TextInput id="s-dur" type="number" inputMode="numeric" min={1} max={1440} value={f.durationMin} disabled={disabled} onChange={(e) => set("durationMin", e.target.value)} />
          </FormField>
          <FormField label="Opens" htmlFor="s-opens" hint="Empty = as soon as it is published.">
            <TextInput id="s-opens" type="datetime-local" value={f.opensAt} disabled={disabled} onChange={(e) => set("opensAt", e.target.value)} />
          </FormField>
          <FormField label="Closes" htmlFor="s-closes" error={errors.closesAt} hint="Attempts still going are cut off here (extra time is honoured).">
            <TextInput id="s-closes" type="datetime-local" value={f.closesAt} disabled={disabled} onChange={(e) => set("closesAt", e.target.value)} />
          </FormField>
          <FormField label="Late entry (minutes, optional)" htmlFor="s-late" error={errors.lateEntryMin} hint="How long after opening a candidate may still start. Empty = any time while open.">
            <TextInput id="s-late" type="number" inputMode="numeric" min={0} value={f.lateEntryMin} disabled={disabled} onChange={(e) => set("lateEntryMin", e.target.value)} />
          </FormField>
          <FormField label="Offline grace (minutes)" htmlFor="s-grace" error={errors.offlineGraceMin} hint="If the network drops, answers saved on the device still count when they arrive this long after time is up.">
            <TextInput id="s-grace" type="number" inputMode="numeric" min={0} max={60} value={f.offlineGraceMin} disabled={disabled} onChange={(e) => set("offlineGraceMin", e.target.value)} />
          </FormField>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Attempts and navigation" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Attempts allowed" htmlFor="s-att" error={errors.attemptsAllowed}>
            <TextInput id="s-att" type="number" inputMode="numeric" min={1} max={20} value={f.attemptsAllowed} disabled={disabled} onChange={(e) => set("attemptsAllowed", e.target.value)} />
          </FormField>
          <FormField label="Wait between attempts (minutes, optional)" htmlFor="s-cool" error={errors.cooldownMin}>
            <TextInput id="s-cool" type="number" inputMode="numeric" min={0} value={f.cooldownMin} disabled={disabled || intOrNull(f.attemptsAllowed) === 1} onChange={(e) => set("cooldownMin", e.target.value)} />
          </FormField>
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <span className="text-[13px] font-bold">Navigation</span>
          <Segmented<ExamNavigationValue>
            ariaLabel="Navigation"
            options={[
              { value: "FREE", label: "Free" },
              { value: "LINEAR", label: "Forward only" },
              { value: "SECTION_LOCKED", label: "Section by section" },
            ]}
            value={f.navigation}
            onChange={(v) => !disabled && set("navigation", v)}
            className="self-start"
          />
          <p className="text-xs font-medium text-muted-foreground">{NAVIGATION_HELP[f.navigation]}</p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ToggleRow id="s-shq" label="Shuffle question order" description="Each candidate gets the questions in a different order (sections can opt out)." checked={f.shuffleQuestions} disabled={disabled} onChange={(v) => set("shuffleQuestions", v)} />
          <ToggleRow id="s-sho" label="Shuffle answer options" description="Options A–D appear in a different order for each candidate." checked={f.shuffleOptions} disabled={disabled} onChange={(v) => set("shuffleOptions", v)} />
        </div>
      </Card>

      <Card>
        <SectionHeading title="Scoring and grades" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Pass mark (%)" htmlFor="s-pass" error={errors.passMark}>
            <TextInput id="s-pass" type="number" inputMode="numeric" min={0} max={100} value={f.passMark} disabled={disabled} onChange={(e) => set("passMark", e.target.value)} />
          </FormField>
          <div className="flex flex-col gap-2">
            <ToggleRow
              id="s-neg"
              label="Negative marking"
              description="Deduct points for a wrong answer (never for a blank one). A question can set its own penalty in the bank."
              checked={f.negativeOn}
              disabled={disabled}
              onChange={(v) => set("negativeOn", v)}
            />
            {f.negativeOn ? (
              <FormField label="Deduct (% of the question's points)" htmlFor="s-negpct" error={errors.negativePct}>
                <TextInput id="s-negpct" type="number" inputMode="numeric" min={1} max={100} value={f.negativePct} disabled={disabled} onChange={(e) => set("negativePct", e.target.value)} />
              </FormField>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-bold">Grade bands</h3>
            {canWrite ? (
              <div className="flex flex-wrap gap-1.5">
                <Button type="button" size="xs" variant="outline" onClick={() => set("gradeBands", bandsToForm(DEFAULT_GRADE_BANDS))}>
                  Use defaults (A–F)
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => set("gradeBands", [...f.gradeBands, { min: "0", label: "", remark: "" }])}>
                  <Icon name="plus" aria-hidden />
                  Add band
                </Button>
                {f.gradeBands.length ? (
                  <Button type="button" size="xs" variant="ghost" onClick={() => set("gradeBands", [])}>
                    Clear
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {f.gradeBands.length === 0 ? (
            <p className="text-xs font-medium text-muted-foreground">No grade bands: results show a score and pass/fail only.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="hidden grid-cols-[100px_100px_1fr_40px] gap-2 text-xs font-black uppercase text-muted-foreground sm:grid">
                <span>From %</span>
                <span>Grade</span>
                <span>Remark</span>
                <span className="sr-only">Remove</span>
              </div>
              {f.gradeBands.map((b, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_40px] gap-2 sm:grid-cols-[100px_100px_1fr_40px]">
                  <TextInput aria-label={`Band ${i + 1} minimum percent`} type="number" min={0} max={100} value={b.min} disabled={disabled} className="px-2 py-1.5"
                    onChange={(e) => set("gradeBands", f.gradeBands.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                  <TextInput aria-label={`Band ${i + 1} grade`} value={b.label} maxLength={20} disabled={disabled} className="px-2 py-1.5"
                    onChange={(e) => set("gradeBands", f.gradeBands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <TextInput aria-label={`Band ${i + 1} remark`} value={b.remark} maxLength={100} disabled={disabled} className="col-span-2 px-2 py-1.5 sm:col-span-1"
                    onChange={(e) => set("gradeBands", f.gradeBands.map((x, j) => (j === i ? { ...x, remark: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove band ${i + 1}`} disabled={disabled} className="row-start-1 col-start-3 sm:col-start-4"
                    onClick={() => set("gradeBands", f.gradeBands.filter((_, j) => j !== i))}>
                    <Icon name="x" aria-hidden />
                  </Button>
                </div>
              ))}
              {errors.gradeBands ? (
                <p role="alert" className="text-xs font-bold text-destructive">
                  {errors.gradeBands}
                </p>
              ) : (
                <p className="text-xs font-medium text-muted-foreground">A score gets the highest band whose minimum it reaches. Include a 0% band so every score gets a grade.</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SectionHeading title="Results and review" />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold">Release results</span>
          <Segmented<ExamResultReleaseValue>
            ariaLabel="Release results"
            options={[
              { value: "IMMEDIATE", label: "Straight away" },
              { value: "AFTER_CLOSE", label: "When it closes" },
              { value: "MANUAL", label: "When I release" },
            ]}
            value={f.resultRelease}
            onChange={(v) => !disabled && set("resultRelease", v)}
            className="self-start"
          />
          <p className="text-xs font-medium text-muted-foreground">{RELEASE_HELP[f.resultRelease]}</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <FormField label="What candidates see afterwards" htmlFor="s-review">
            <SelectInput
              id="s-review"
              allowEmpty={false}
              disabled={disabled}
              options={[
                { value: "NONE", label: "Nothing (just that it was submitted)" },
                { value: "SCORE_ONLY", label: "Score and grade only" },
                { value: "ANSWERS", label: "Score plus their answers and the correct ones" },
                { value: "ANSWERS_WITH_EXPLANATIONS", label: "All of that plus explanations" },
              ]}
              value={f.reviewMode}
              onChange={(e) => set("reviewMode", e.target.value as ExamReviewModeValue)}
            />
          </FormField>
          <FormField label="Award a certificate on a pass (optional)" htmlFor="s-cert" hint="Only learners with an account receive certificates.">
            <SelectInput
              id="s-cert"
              placeholder="No certificate"
              disabled={disabled}
              options={certificates.map((c) => ({ value: c.id, label: c.name }))}
              value={f.certificateId}
              onChange={(e) => set("certificateId", e.target.value)}
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <SectionHeading title="Candidate tools" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Calculator" htmlFor="s-calc">
            <SelectInput
              id="s-calc"
              allowEmpty={false}
              disabled={disabled}
              options={[
                { value: "NONE", label: "None" },
                { value: "BASIC", label: "Basic (+ − × ÷)" },
                { value: "SCIENTIFIC", label: "Scientific" },
              ]}
              value={f.calculator}
              onChange={(e) => set("calculator", e.target.value as ExamCalculatorValue)}
            />
          </FormField>
          <FormField label="Formula sheet (optional)" htmlFor="s-formula" hint="Candidates can open it at any time. Plain text with $maths$.">
            <TextArea id="s-formula" value={f.formulaSheetHtml} disabled={disabled} maxLength={20000} onChange={(e) => set("formulaSheetHtml", e.target.value)} />
          </FormField>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(Object.keys(TOOL_LABELS) as (keyof ExamTools)[]).map((k) => (
            <ToggleRow
              key={k}
              id={`s-tool-${k}`}
              label={TOOL_LABELS[k].label}
              description={TOOL_LABELS[k].description}
              checked={f.tools[k]}
              disabled={disabled}
              onChange={(v) => set("tools", { ...f.tools, [k]: v })}
            />
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeading title="Who can sit it" />
        <div className="flex flex-col gap-1.5">
          <Segmented<ExamAccessModeValue>
            ariaLabel="Who can sit it"
            options={[
              { value: "INVITED", label: "Only listed candidates" },
              { value: "ENROLLED", label: "Course enrollees" },
              { value: "ACCESS_CODE", label: "Anyone with a code" },
            ]}
            value={f.accessMode}
            onChange={(v) => !disabled && set("accessMode", v)}
            className="self-start"
          />
          <p className="text-xs font-medium text-muted-foreground">
            {f.accessMode === "INVITED"
              ? "Only the people on the Candidates tab can sit it."
              : f.accessMode === "ENROLLED"
                ? "Anyone enrolled on the linked course can start it from their dashboard; listed candidates can too."
                : "Any learner of the academy who types the access code can join; listed candidates can too."}
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {f.accessMode === "ACCESS_CODE" ? (
            <FormField label="Access code" htmlFor="s-code-access" error={errors.accessCode}>
              <TextInput id="s-code-access" value={f.accessCode} maxLength={40} disabled={disabled} autoComplete="off" className="font-mono" onChange={(e) => set("accessCode", e.target.value)} />
            </FormField>
          ) : null}
          <ToggleRow
            id="s-pin"
            label="Allow sign-in with Exam ID and PIN"
            description="Candidates without an account (and anyone at a shared exam-centre computer) sign in at /exam with the details on their slip."
            checked={f.pinLogin}
            disabled={disabled}
            onChange={(v) => set("pinLogin", v)}
          />
        </div>
      </Card>

      {canWrite ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-[12px] border-2 border-border bg-card px-4 py-3 shadow-md">
          {errors.form ? (
            <p role="alert" className="mr-auto text-sm font-bold text-destructive">
              {errors.form}
            </p>
          ) : (
            <p className="mr-auto text-[13px] font-medium text-muted-foreground">{saved.dirty ? "You have unsaved changes." : "All changes saved."}</p>
          )}
          <Button type="button" onClick={save} disabled={saving || !saved.dirty}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

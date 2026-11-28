"use client";

import { useState } from "react";
import { apiPatch } from "@/lib/client/api";
import { Card } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/icon";
import { useToast } from "@/components/ui/toast";
import { FormField, SelectInput, TextInput } from "@/components/form-field";
import { PasswordInput } from "@/components/password-input";
import { useSavedSnapshot, useUnsavedGuard } from "@/components/use-unsaved-guard";
import { SECURITY_PRESETS, type ExamSecurity, type LockdownLevel } from "@/lib/exams/settings";
import { cn } from "@/lib/utils";
import { useBuilder } from "./builder-context";
import { Notice, SectionHeading, ToggleRow, intOrNull } from "./ui";

const PRESETS: { level: LockdownLevel; title: string; icon: IconName; summary: string }[] = [
  {
    level: "STANDARD",
    title: "Standard",
    icon: "shield",
    summary: "For quizzes and practice. Logs leaving the tab and blocks copy-paste, but never stops a candidate.",
  },
  {
    level: "STRICT",
    title: "Strict",
    icon: "lock",
    summary: "For real exams in an ordinary browser: full screen, shortcuts blocked, a watermark, and a lock after 5 incidents.",
  },
  {
    level: "SEB_REQUIRED",
    title: "Safe Exam Browser",
    icon: "monitor",
    summary: "For high stakes. Only opens inside Safe Exam Browser, which locks the whole computer until the exam ends.",
  },
];

type Toggle = keyof Pick<
  ExamSecurity,
  | "requireFullscreen"
  | "blockClipboard"
  | "blockContextMenu"
  | "blockPrint"
  | "blockShortcuts"
  | "detectTabSwitch"
  | "detectMultiScreen"
  | "watermark"
  | "singleDevice"
  | "enforceIpAllowlist"
>;

const TOGGLES: { key: Toggle; label: string; description: string }[] = [
  { key: "requireFullscreen", label: "Require full screen", description: "Questions stay hidden until the window is full screen, and hide again if the candidate leaves it." },
  { key: "detectTabSwitch", label: "Record leaving the exam", description: "Switching tab or app, or minimising, is logged as an incident and counts toward the limit below." },
  { key: "blockClipboard", label: "Block copy, cut and paste", description: "Stops questions being copied out and answers pasted in." },
  { key: "blockContextMenu", label: "Block the right-click menu", description: "Removes “Search Google for…”, “Translate” and similar shortcuts." },
  { key: "blockPrint", label: "Block printing", description: "Ctrl+P and the print menu do nothing; a printed page would be blank." },
  { key: "blockShortcuts", label: "Block browser shortcuts", description: "Developer tools (F12, Ctrl+Shift+I), view source, save page and reload are blocked." },
  { key: "detectMultiScreen", label: "Detect a second screen", description: "Logs an incident when more than one monitor is connected (supported browsers)." },
  { key: "watermark", label: "Watermark the paper", description: "A faint repeated name and Exam ID over the questions, so a photo of the screen can be traced." },
  { key: "singleDevice", label: "One device per attempt", description: "A second device opening the same attempt is refused until an invigilator resets it." },
  { key: "enforceIpAllowlist", label: "Enforce sitting IP ranges", description: "Candidates in a sitting with IP ranges must start from those networks (set on the Sittings tab)." },
];

const HEX64 = /^[a-f0-9]{64}$/i;

export function SecurityTab() {
  const { exam, reload, canWrite } = useBuilder();
  const { toast } = useToast();
  const [s, setS] = useState<ExamSecurity>(exam.security);
  const [awayOn, setAwayOn] = useState(exam.security.awayAutoSubmitSec != null);
  const [awaySec, setAwaySec] = useState(String(exam.security.awayAutoSubmitSec ?? 60));
  const [configKeys, setConfigKeys] = useState<string[]>(exam.security.seb.configKeys.length ? exam.security.seb.configKeys : [""]);
  const [examKeys, setExamKeys] = useState<string[]>(exam.security.seb.browserExamKeys);
  const [quitPassword, setQuitPassword] = useState(exam.security.seb.quitPassword ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const saved = useSavedSnapshot({ s, awayOn, awaySec, configKeys, examKeys, quitPassword });
  useUnsavedGuard(canWrite && saved.dirty);
  const disabled = !canWrite;

  function applyPreset(level: LockdownLevel) {
    if (disabled) return;
    const preset = SECURITY_PRESETS[level];
    setS((prev) => ({ ...prev, ...preset, lockdown: level }));
    if ("awayAutoSubmitSec" in preset) {
      setAwayOn(preset.awayAutoSubmitSec != null);
      if (preset.awayAutoSubmitSec != null) setAwaySec(String(preset.awayAutoSubmitSec));
    }
  }

  const cleanKeys = (keys: string[]) => keys.map((k) => k.trim().toLowerCase()).filter(Boolean);
  const badKey = [...cleanKeys(configKeys), ...cleanKeys(examKeys)].find((k) => !HEX64.test(k));
  const sebKeys = cleanKeys(configKeys).length + cleanKeys(examKeys).length;

  async function save() {
    const away = intOrNull(awaySec);
    if (awayOn && (away == null || away < 10 || away > 3600)) return setError("Auto-submit after between 10 and 3600 seconds away.");
    if (s.maxViolations < 0 || s.maxViolations > 50) return setError("The incident limit is from 0 to 50.");
    if (badKey) return setError("A Safe Exam Browser key must be exactly 64 characters, 0–9 and a–f. Copy it again from the SEB Config Tool.");
    if (cleanKeys(configKeys).length > 10 || cleanKeys(examKeys).length > 10) return setError("At most 10 keys of each kind.");
    setError(null);
    setSaving(true);
    const securityJson: ExamSecurity = {
      ...s,
      awayAutoSubmitSec: awayOn ? away : null,
      seb: {
        configKeys: [...new Set(cleanKeys(configKeys))],
        browserExamKeys: [...new Set(cleanKeys(examKeys))],
        quitPassword: quitPassword.trim() || null,
      },
    };
    const res = await apiPatch(`/api/tenant/exams/${exam.id}`, { securityJson });
    setSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    saved.markSaved();
    toast("Security settings saved.");
    await reload();
  }

  return (
    <div className="flex flex-col gap-5 pb-20">
      <Card>
        <SectionHeading title="How locked down?">
          Pick a starting point, then adjust anything below. No browser page can stop a determined candidate on its own — the strict settings make cheating visible; Safe Exam Browser makes it impractical.
        </SectionHeading>
        <div className="grid gap-3 md:grid-cols-3">
          {PRESETS.map((p) => {
            const active = s.lockdown === p.level;
            return (
              <button
                key={p.level}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => applyPreset(p.level)}
                className={cn(
                  "flex flex-col gap-2 rounded-[12px] border-2 border-border p-4 text-left outline-none transition-transform focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed",
                  active ? "bg-primary text-primary-foreground shadow-md" : "bg-card shadow-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-md"
                )}
              >
                <span className="flex items-center gap-2 font-heading text-base">
                  <Icon name={p.icon} className="size-5" aria-hidden />
                  {p.title}
                  {active ? <Icon name="check-circle" className="ml-auto size-5" aria-hidden /> : null}
                </span>
                <span className={cn("text-[13px] font-medium", active ? "opacity-90" : "text-muted-foreground")}>{p.summary}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionHeading title="Rules" />
        <div className="grid gap-3 md:grid-cols-2">
          {TOGGLES.map((t) => (
            <ToggleRow key={t.key} id={`sec-${t.key}`} label={t.label} description={t.description} checked={s[t.key]} disabled={disabled} onChange={(v) => setS((prev) => ({ ...prev, [t.key]: v }))} />
          ))}
        </div>

        <div className="mt-5 grid gap-4 border-t-2 border-dashed border-border pt-4 sm:grid-cols-2">
          <FormField label="Incidents allowed" htmlFor="sec-max" hint="Tab switches, leaving full screen and the like. 0 = never act, just log them for the invigilator.">
            <TextInput
              id="sec-max"
              type="number"
              inputMode="numeric"
              min={0}
              max={50}
              value={String(s.maxViolations)}
              disabled={disabled}
              onChange={(e) => setS((prev) => ({ ...prev, maxViolations: Math.max(0, intOrNull(e.target.value) ?? 0) }))}
            />
          </FormField>
          <FormField label="When the limit is reached" htmlFor="sec-action">
            <SelectInput
              id="sec-action"
              allowEmpty={false}
              disabled={disabled || s.maxViolations === 0}
              options={[
                { value: "WARN", label: "Show a final warning only" },
                { value: "LOCK", label: "Lock the paper until an invigilator unlocks it" },
                { value: "AUTO_SUBMIT", label: "Submit the attempt automatically" },
              ]}
              value={s.onMaxViolations}
              onChange={(e) => setS((prev) => ({ ...prev, onMaxViolations: e.target.value as ExamSecurity["onMaxViolations"] }))}
            />
          </FormField>
          <div className="flex flex-col gap-2 sm:col-span-2 md:col-span-1">
            <ToggleRow
              id="sec-away"
              label="Submit if away too long"
              description="Ends the attempt when the candidate stays out of the exam (another tab, not full screen) for this long in one go."
              checked={awayOn}
              disabled={disabled}
              onChange={setAwayOn}
            />
            {awayOn ? (
              <FormField label="Seconds away" htmlFor="sec-away-sec">
                <TextInput id="sec-away-sec" type="number" inputMode="numeric" min={10} max={3600} value={awaySec} disabled={disabled} onChange={(e) => setAwaySec(e.target.value)} />
              </FormField>
            ) : null}
          </div>
        </div>
        {s.enforceIpAllowlist ? (
          <Notice className="mt-4">
            IP ranges are set per sitting on the Sittings tab. A sitting with no ranges can be joined from anywhere, so set them for every exam-centre sitting. The ranges must be the centre&apos;s public (internet-facing) addresses.
          </Notice>
        ) : null}
      </Card>

      <Card>
        <SectionHeading title="Safe Exam Browser">
          A free kiosk browser for Windows, macOS and iPad (safeexambrowser.org). While it runs the candidate cannot switch apps, open other sites or quit without the invigilator&apos;s password.
        </SectionHeading>
        {s.lockdown === "SEB_REQUIRED" && sebKeys === 0 ? (
          <Notice tone="error" className="mb-4">
            Safe Exam Browser is required but no key is set yet, so nobody could get in. Follow the steps below.
          </Notice>
        ) : null}
        {s.lockdown !== "SEB_REQUIRED" ? (
          <Notice className="mb-4">Not required for this exam. Choose the Safe Exam Browser level above to require it.</Notice>
        ) : null}

        <ol className="flex flex-col gap-3 text-[13px] font-medium">
          <li className="flex gap-3">
            <span className="num flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-border bg-primary text-xs font-black text-primary-foreground">1</span>
            <div className="flex-1">
              <p className="font-bold">Set the quit password (optional) and save.</p>
              <p className="text-muted-foreground">Invigilators type it to close SEB on a machine. It is built into the file, so changing it later means repeating these steps.</p>
              <div className="mt-2 max-w-sm">
                <FormField label="Quit password" htmlFor="sec-quit">
                  <PasswordInput id="sec-quit" value={quitPassword} disabled={disabled} autoComplete="new-password" onChange={(e) => setQuitPassword(e.target.value)} />
                </FormField>
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="num flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-border bg-primary text-xs font-black text-primary-foreground">2</span>
            <div className="flex-1">
              <p className="font-bold">Download the configuration file.</p>
              <p className="text-muted-foreground">It opens SEB straight on this exam and allows only your academy&apos;s exam pages. Copy it to every exam computer (or share it with candidates sitting at home).</p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <a href={`/api/tenant/exams/${exam.id}/seb`} download aria-disabled={saved.dirty || undefined}>
                  <Icon name="download" aria-hidden />
                  Download .seb file
                </a>
              </Button>
              {saved.dirty ? <p className="mt-1 text-xs font-bold text-foreground">Save first — the file uses the saved quit password.</p> : null}
            </div>
          </li>
          <li className="flex gap-3">
            <span className="num flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-border bg-primary text-xs font-black text-primary-foreground">3</span>
            <div className="flex-1">
              <p className="font-bold">Open the file in the SEB Config Tool and copy its Config Key.</p>
              <p className="text-muted-foreground">
                On Windows: right-click the file → Edit with SEB Config Tool → General tab → “Use Browser Exam Key and Configuration Key” → copy the Configuration Key. On macOS: open it in SEB → Preferences → Exam → Config Key.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="num flex size-6 shrink-0 items-center justify-center rounded-[7px] border-2 border-border bg-primary text-xs font-black text-primary-foreground">4</span>
            <div className="flex-1">
              <p className="font-bold">Paste it here and save.</p>
              <p className="text-muted-foreground">Only SEB running exactly this configuration is let in. Add a key per SEB version if centres use different ones.</p>
              <KeyList id="sec-ck" label="Config Key" keys={configKeys} onChange={setConfigKeys} disabled={disabled} />
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] font-bold underline-offset-2 hover:underline">Advanced: Browser Exam Keys</summary>
                <p className="mt-1 text-muted-foreground">Only if your centre requires them: these also pin the exact SEB build. Most academies use Config Keys alone.</p>
                <KeyList id="sec-bek" label="Browser Exam Key" keys={examKeys} onChange={setExamKeys} disabled={disabled} />
              </details>
            </div>
          </li>
        </ol>
      </Card>

      {canWrite ? (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-3 rounded-[12px] border-2 border-border bg-card px-4 py-3 shadow-md">
          {error ? (
            <p role="alert" className="mr-auto text-sm font-bold text-destructive">
              {error}
            </p>
          ) : (
            <p className="mr-auto text-[13px] font-medium text-muted-foreground">{saved.dirty ? "You have unsaved changes." : "All changes saved."}</p>
          )}
          <Button type="button" onClick={save} disabled={saving || !saved.dirty}>
            {saving ? "Saving…" : "Save security"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function KeyList({ id, label, keys, onChange, disabled }: { id: string; label: string; keys: string[]; onChange: (keys: string[]) => void; disabled: boolean }) {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {keys.map((k, i) => {
        const bad = k.trim() !== "" && !HEX64.test(k.trim());
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor={`${id}-${i}`} className="sr-only">
                {label} {i + 1}
              </label>
              <TextInput
                id={`${id}-${i}`}
                value={k}
                disabled={disabled}
                spellCheck={false}
                autoComplete="off"
                placeholder="64 characters, 0–9 and a–f"
                className="font-mono text-[13px]"
                aria-invalid={bad || undefined}
                aria-describedby={bad ? `${id}-${i}-err` : undefined}
                onChange={(e) => onChange(keys.map((x, j) => (j === i ? e.target.value.replace(/\s+/g, "") : x)))}
              />
              {bad ? (
                <p id={`${id}-${i}-err`} className="mt-1 text-xs font-bold text-destructive">
                  {k.trim().length} of 64 characters{/[^a-f0-9]/i.test(k.trim()) ? ", and only 0–9 and a–f are allowed" : ""}.
                </p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${label} ${i + 1}`} disabled={disabled} onClick={() => onChange(keys.filter((_, j) => j !== i))}>
              <Icon name="x" aria-hidden />
            </Button>
          </div>
        );
      })}
      {keys.length < 10 ? (
        <div>
          <Button type="button" variant="outline" size="xs" disabled={disabled} onClick={() => onChange([...keys, ""])}>
            <Icon name="plus" aria-hidden />
            Add {label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import {
  MONTH_OPTIONS,
  PROFILE_YEAR_RANGE,
  type ClientProfile,
  type ProfileSection,
} from "@/lib/schemas/client-profile";

/* -------------------------------------------------------------------------- */
/* The editor, as the sections see it                                          */
/* -------------------------------------------------------------------------- */

/** Which form is open: a whole section, or one entry of a list section. */
export type OpenTarget = { section: ProfileSection; entryId?: string };

export type SaveResult = { ok: true } | { ok: false; message: string | null };

export type ProfileAccount = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export type IssuedCertificate = {
  id: string;
  name: string;
  /** The course or programme it was earned on. */
  earnedOn: string | null;
  serial: string;
  /** Formatted on the server, in the academy's locale and time zone. */
  issuedLabel: string;
};

export type ProfileEditorContext = {
  profile: ClientProfile;
  account: ProfileAccount;
  uploadsEnabled: boolean;
  open: OpenTarget | null;
  /**
   * Open a form. Refused — and the open form says why — while another form has
   * changes that have not been saved, so nothing typed is ever lost silently.
   */
  requestOpen: (target: OpenTarget) => boolean;
  /** True when nothing unsaved stands in the way of another action. */
  guard: () => boolean;
  close: () => void;
  setDirty: (dirty: boolean) => void;
  /** Counts refusals, so the open form can re-announce its notice each time. */
  refusals: number;
  saving: boolean;
  save: (
    patch: { section: ProfileSection; value: unknown },
    done: string,
    options?: { keepOpen?: boolean }
  ) => Promise<SaveResult>;
};

const EditorContext = createContext<ProfileEditorContext | null>(null);
export const ProfileEditorProvider = EditorContext.Provider;

export function useProfileEditor(): ProfileEditorContext {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useProfileEditor must be used inside the profile editor.");
  return ctx;
}

export function isOpen(open: OpenTarget | null, section: ProfileSection, entryId?: string): boolean {
  return open?.section === section && open.entryId === entryId;
}

/* -------------------------------------------------------------------------- */
/* Form state                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A form's values, and whether they differ from what it opened with.
 *
 * Dirtiness is reported to the editor, which is what lets it refuse to open a
 * second form — or let the tab close — over unsaved work.
 */
export function useDraft<T extends Record<string, unknown>>(initial: T) {
  const { setDirty } = useProfileEditor();
  const [values, setValues] = useState<T>(initial);
  // The values the form opened with. Held in state, not a ref: it never changes
  // for the life of the form, and a form is remounted to edit something else.
  const [opened] = useState(() => JSON.stringify(initial));
  const dirty = useMemo(() => JSON.stringify(values) !== opened, [values, opened]);

  useEffect(() => {
    setDirty(dirty);
  }, [dirty, setDirty]);
  // Closing the form by any route leaves nothing unsaved behind it.
  useEffect(() => () => setDirty(false), [setDirty]);

  function set<K extends keyof T>(key: K, value: T[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return { values, set, setValues, dirty };
}

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

export function SectionCard({
  section,
  title,
  description,
  action,
  children,
}: {
  section: ProfileSection;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={section}
      aria-labelledby={`${section}-title`}
      // Leaves room under the sticky mobile bar when a "what's missing" link jumps here.
      className="scroll-mt-20 rounded-[14px] border-2 border-border bg-card p-4 shadow-md sm:p-5 lg:scroll-mt-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {/* Focus lands here when a form in this section closes. */}
          <h2
            id={`${section}-title`}
            tabIndex={-1}
            className="font-heading text-lg leading-tight outline-none focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-prose text-sm font-medium text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** What an empty section says: what belongs here, and why it is worth adding. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[10px] border-2 border-dashed border-border px-3.5 py-3 text-sm font-medium text-muted-foreground">
      {children}
    </p>
  );
}

/** The frame every open form sits in, so an open form reads as one thing. */
export function FormPanel({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const { refusals } = useProfileEditor();
  const ref = useRef<HTMLFormElement>(null);
  const seen = useRef(refusals);

  // Another form was asked for while this one has unsaved changes: bring this
  // one into view, since the notice below is the answer to that press.
  useEffect(() => {
    if (refusals === seen.current) return;
    seen.current = refusals;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [refusals]);

  return (
    <form
      ref={ref}
      aria-label={title}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4 rounded-[12px] border-2 border-border bg-background p-3.5 sm:p-4"
    >
      <h3 className="font-heading text-base leading-tight">{title}</h3>
      {children}
    </form>
  );
}

/**
 * Save and Cancel, with the two things that can interrupt them: a refusal to
 * leave unsaved changes, and a request to confirm throwing them away.
 */
export function FormActions({
  dirty,
  error,
  saveLabel = "Save",
  busyLabel = "Saving…",
  busy,
}: {
  dirty: boolean;
  /** Why the last save was refused, in the server's words. */
  error: string | null;
  saveLabel?: string;
  busyLabel?: string;
  /** For work a form does itself before saving, such as an upload. */
  busy?: boolean;
}) {
  const { close, saving, refusals } = useProfileEditor();
  const [confirming, setConfirming] = useState(false);
  const working = saving || !!busy;
  // A refusal that happened while this form was open, and still has something to protect.
  const [opened] = useState(refusals);
  const blocked = refusals > opened && dirty;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[10px] border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm font-bold text-foreground"
        >
          <Icon name="alert-triangle" className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}

      {blocked && !confirming ? (
        // Keyed by the count so a second refusal is announced again.
        <p
          key={refusals}
          role="alert"
          className="rounded-[10px] border-2 border-warning bg-warning/15 px-3 py-2 text-sm font-bold text-foreground"
        >
          You have changes here that aren&rsquo;t saved. Save or discard them before you edit
          something else.
        </p>
      ) : null}

      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Discard your changes?"
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[10px] border-2 border-warning bg-warning/15 px-3 py-2.5"
        >
          <p className="text-sm font-bold text-foreground">Discard what you&rsquo;ve changed here?</p>
          {/* Focus starts on the choice that loses nothing. */}
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="destructive" onClick={close}>
              Discard
            </Button>
            <Button type="button" size="sm" variant="outline" autoFocus onClick={() => setConfirming(false)}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={working}>
            {working ? busyLabel : saveLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={working}
            onClick={() => (dirty ? setConfirming(true) : close())}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                      */
/* -------------------------------------------------------------------------- */

const CONTROL =
  "w-full rounded-[10px] border-2 border-border bg-card px-3.5 py-2.5 text-[16px] font-medium text-card-foreground outline-none transition-[box-shadow,transform] placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive";

/**
 * A labelled field with its hint and its error wired to the control.
 *
 * `children` receives the ids to put on the control, because a hint or an
 * error that is only near an input is invisible to a screen reader; it has to
 * be the input's description.
 */
export function Field({
  label,
  optional,
  hint,
  error,
  counter,
  className,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  /** e.g. "84 of 120" — shown at the right of the hint line. */
  counter?: string;
  className?: string;
  children: (control: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint || counter ? hintId : null].filter(Boolean).join(" ");

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-bold text-foreground">
        {label}
        {optional ? <span className="font-medium text-muted-foreground"> (optional)</span> : null}
      </label>
      {children({
        id,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {error ? (
        <p id={errorId} className="text-xs font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {hint || counter ? (
        <p id={hintId} className="flex justify-between gap-3 text-xs font-medium text-muted-foreground">
          <span>{hint}</span>
          {counter ? <span className="num shrink-0">{counter}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  hint?: string;
  error?: string;
  /** Shows "n of max" and stops typing at the limit. */
  max?: number;
  className?: string;
  type?: "text" | "tel" | "url" | "date";
  autoComplete?: string;
  inputMode?: "text" | "tel" | "url";
  placeholder?: string;
  autoFocus?: boolean;
  maxDate?: string;
};

export function TextField({
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  max,
  className,
  type = "text",
  maxDate,
  ...input
}: TextFieldProps) {
  return (
    <Field
      label={label}
      optional={optional}
      hint={hint}
      error={error}
      className={className}
      counter={max && value.length > max * 0.7 ? `${value.length} of ${max}` : undefined}
    >
      {(control) => (
        <input
          {...control}
          {...input}
          type={type}
          value={value}
          maxLength={max}
          max={maxDate}
          onChange={(event) => onChange(event.target.value)}
          className={CONTROL}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  optional,
  hint,
  error,
  max,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  hint?: string;
  error?: string;
  max: number;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label} optional={optional} hint={hint} error={error} counter={`${value.length} of ${max}`}>
      {(control) => (
        <textarea
          {...control}
          value={value}
          rows={rows}
          maxLength={max}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(CONTROL, "min-h-24 resize-y leading-relaxed")}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  optional,
  placeholder,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  optional?: boolean;
  /** The empty choice. Leave out for a select that must have a value. */
  placeholder?: string;
  hint?: string;
  error?: string;
  className?: string;
}) {
  return (
    <Field label={label} optional={optional} hint={hint} error={error} className={className}>
      {(control) => (
        <select {...control} value={value} onChange={(event) => onChange(event.target.value)} className={CONTROL}>
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Newest first: the year someone wants is almost always a recent one. */
function yearOptions(latest: number): { value: string; label: string }[] {
  const years: { value: string; label: string }[] = [];
  for (let year = Math.min(latest, PROFILE_YEAR_RANGE.max); year >= PROFILE_YEAR_RANGE.min; year--) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

/**
 * A month and a year, as two menus.
 *
 * Not `<input type="month">`: Firefox and Safari on the desktop show that as a
 * bare text box, leaving people to guess that it wants "2022-03". Two menus
 * work everywhere and cannot hold a date that does not exist.
 *
 * The value is `YYYY-MM`, or "" until both halves are chosen.
 */
export function MonthField({
  label,
  value,
  onChange,
  optional,
  disabled,
  error,
  hint,
  yearsAhead = 0,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  disabled?: boolean;
  error?: string;
  hint?: string;
  /** How far past this year the menu goes — an expiry date is in the future. */
  yearsAhead?: number;
}) {
  const id = useId();
  const [year, month] = value ? value.split("-") : ["", ""];
  // Half-chosen values live here until the other half arrives.
  const [partial, setPartial] = useState({ year: "", month: "" });
  const shownYear = year || partial.year;
  const shownMonth = month || partial.month;
  const [thisYear] = useState(() => new Date().getFullYear());

  function update(next: { year: string; month: string }) {
    const complete = Boolean(next.year && next.month);
    // Once both halves are chosen the value itself is the record; keeping a
    // copy here would bring a cleared date back when the field is re-enabled.
    setPartial(complete ? { year: "", month: "" } : next);
    onChange(complete ? `${next.year}-${next.month}` : "");
  }

  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={disabled} aria-describedby={describedBy}>
      <legend className="mb-1.5 text-[13px] font-bold text-foreground">
        {label}
        {optional ? <span className="font-medium text-muted-foreground"> (optional)</span> : null}
      </legend>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <select
          aria-label={`${label}, month`}
          aria-invalid={error ? true : undefined}
          value={shownMonth}
          onChange={(event) => update({ year: shownYear, month: event.target.value })}
          className={CONTROL}
        >
          <option value="">Month</option>
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label}, year`}
          aria-invalid={error ? true : undefined}
          value={shownYear}
          onChange={(event) => update({ year: event.target.value, month: shownMonth })}
          className={CONTROL}
        >
          <option value="">Year</option>
          {yearOptions(thisYear + yearsAhead).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs font-bold text-destructive">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs font-medium text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

export function YearField({
  label,
  value,
  onChange,
  error,
  hint,
  yearsAhead = 0,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  yearsAhead?: number;
}) {
  const [thisYear] = useState(() => new Date().getFullYear());
  return (
    <SelectField
      label={label}
      optional
      value={value}
      onChange={onChange}
      options={yearOptions(thisYear + yearsAhead)}
      placeholder="Year"
      error={error}
      hint={hint}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Entries in a list section                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Edit and Remove for one entry. Remove asks first, in place: the entry is one
 * press from gone, and a browser confirm box says nothing about which entry.
 */
export function EntryActions({
  label,
  onEdit,
  onRemove,
}: {
  /** What the entry is, for the buttons' accessible names: "Analyst at Kuda". */
  label: string;
  onEdit: () => void;
  onRemove: () => Promise<void>;
}) {
  const { saving, guard } = useProfileEditor();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div
        role="alertdialog"
        aria-label={`Remove ${label}?`}
        className="flex flex-wrap items-center gap-2 rounded-[10px] border-2 border-warning bg-warning/15 px-2.5 py-2"
      >
        <span className="text-[13px] font-bold text-foreground">Remove this?</span>
        <Button
          type="button"
          size="xs"
          variant="destructive"
          disabled={saving}
          onClick={async () => {
            await onRemove();
            setConfirming(false);
          }}
        >
          {saving ? "Removing…" : "Remove"}
        </Button>
        {/* Focus starts on the choice that loses nothing. */}
        <Button
          type="button"
          size="xs"
          variant="outline"
          autoFocus
          disabled={saving}
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      <Button type="button" size="xs" variant="outline" onClick={onEdit} aria-label={`Edit ${label}`}>
        Edit
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="outline"
        aria-label={`Remove ${label}`}
        onClick={() => {
          if (guard()) setConfirming(true);
        }}
      >
        <Icon name="trash" aria-hidden />
      </Button>
    </div>
  );
}

/** Empty strings in a form stand for "not given"; the server stores null. */
export function orEmpty(value: string | number | null | undefined): string {
  return value == null ? "" : String(value);
}

import {
  Children,
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/** Attributes a field is given so assistive technology can tie it to its label, hint and error. */
type FieldWiring = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-required"?: boolean | "true" | "false";
};

/**
 * A labelled field: label, control, and either a hint or an error.
 *
 * The control is whatever is passed as children. When that is a single form
 * control — one of the three below, or a native `input`, `select` or
 * `textarea` — it is wired up automatically:
 *
 *  - it gets the field's `id` if it has none, so the label always points at it;
 *  - `aria-describedby` names the hint or the error, so a screen reader reads
 *    "Pass mark, edit, the score a learner needs…" instead of just the label;
 *  - `aria-invalid` is set while there is an error.
 *
 * Anything else (a wrapper with a control and a button inside, a custom
 * widget) is left alone, and should carry `id={htmlFor}` itself.
 *
 * The hint and error sit outside the `<label>` on purpose. Inside it they
 * become part of the control's NAME, and every field announces its help text
 * as if it were its title.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  /** Marks the field as required, visibly and to assistive technology. */
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-bold text-foreground">
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
      </label>
      {wire(children, { id: htmlFor, describedBy, invalid: Boolean(error), required })}
      {hint && !error ? (
        <p id={hintId} className="text-xs font-medium text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        // role="alert": an error that appears after a submit is announced
        // without the person having to go looking for it.
        <p id={errorId} role="alert" className="text-xs font-bold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const NATIVE_CONTROLS = new Set(["input", "select", "textarea"]);

function isFormControl(element: ReactElement): boolean {
  const type = element.type;
  if (typeof type === "string") return NATIVE_CONTROLS.has(type);
  return type === TextInput || type === TextArea || type === SelectInput;
}

/** Tie a lone form control to its label, hint and error. Anything else passes through. */
function wire(
  children: ReactNode,
  field: { id: string; describedBy?: string; invalid: boolean; required?: boolean }
): ReactNode {
  const only = Children.toArray(children);
  if (only.length !== 1) return children;
  const child = only[0];
  if (!isValidElement<FieldWiring>(child) || !isFormControl(child)) return children;

  const given = child.props;
  const describedBy = [given["aria-describedby"], field.describedBy].filter(Boolean).join(" ") || undefined;

  return cloneElement(child, {
    // What the author wrote always wins; these only fill gaps.
    id: given.id ?? field.id,
    "aria-describedby": describedBy,
    "aria-invalid": given["aria-invalid"] ?? (field.invalid ? true : undefined),
    "aria-required": given["aria-required"] ?? (field.required ? true : undefined),
  });
}

/**
 * Shared look for text controls. The focus ring is the house outline; the
 * hard shadow that used to be the only focus cue is kept alongside it, since
 * on its own it was too easy to miss against a busy form.
 */
const controlClass =
  "w-full rounded-[10px] border-2 border-border bg-card px-3.5 py-2.5 text-[16px] font-medium text-card-foreground outline-none transition-[box-shadow] placeholder:font-normal placeholder:text-muted-foreground focus-visible:shadow-sm focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props} className={cn(controlClass, props.className)} />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(controlClass, "min-h-24 resize-y leading-relaxed", props.className)}
    />
  );
}

/**
 * The caret that says "this opens a list". `appearance-none` removes the
 * browser's own, and without a replacement a select is indistinguishable from
 * a text box. Drawn from two gradients in the text colour, so it follows the
 * theme and needs no wrapper element (callers size this control directly).
 */
const selectCaret =
  "appearance-none bg-no-repeat pr-10 [background-image:linear-gradient(45deg,transparent_50%,currentColor_50%),linear-gradient(135deg,currentColor_50%,transparent_50%)] [background-position:calc(100%_-_1.15rem)_55%,calc(100%_-_0.8rem)_55%] [background-size:0.35rem_0.35rem,0.35rem_0.35rem]";

export function SelectInput({
  options,
  placeholder = "Select…",
  allowEmpty = true,
  optionKey,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[];
  placeholder?: string;
  allowEmpty?: boolean;
  optionKey?: (opt: { value: string; label: string }) => string;
}) {
  return (
    <select {...props} className={cn(controlClass, selectCaret, className)}>
      {allowEmpty ? <option value="">{placeholder}</option> : null}
      {options.map((opt) => (
        <option key={optionKey ? optionKey(opt) : opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

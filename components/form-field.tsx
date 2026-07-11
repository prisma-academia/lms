import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={htmlFor}>
      <span className="text-[13px] font-bold text-ink">{label}</span>
      {children}
      {hint && !error ? (
        <span className="text-xs font-medium text-ink/60">{hint}</span>
      ) : null}
      {error ? (
        <span className="text-xs font-bold text-red">{error}</span>
      ) : null}
    </label>
  );
}

const controlClass =
  "w-full rounded-[10px] border-2 border-ink bg-card px-3.5 py-2.5 text-[16px] font-medium text-ink outline-none transition-[box-shadow,transform] placeholder:font-normal placeholder:text-ink/35 focus:-translate-x-px focus:-translate-y-px focus:shadow-brutal-sm disabled:cursor-not-allowed disabled:opacity-60";

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
    <select {...props} className={cn(controlClass, "appearance-none pr-9", className)}>
      {allowEmpty ? <option value="">{placeholder}</option> : null}
      {options.map((opt) => (
        <option key={optionKey ? optionKey(opt) : opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

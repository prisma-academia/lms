"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export function OtpInput({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = false,
  "aria-invalid": ariaInvalid,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-invalid"?: boolean;
  id?: string;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.split("").slice(0, length);

  function focusAt(index: number) {
    const el = inputs.current[Math.max(0, Math.min(length - 1, index))];
    el?.focus();
    el?.select();
  }

  function setDigit(index: number, digit: string) {
    const next = value.split("");
    while (next.length < length) next.push("");
    next[index] = digit;
    onChange(next.join("").replace(/\D/g, "").slice(0, length));
  }

  function handleChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      setDigit(index, "");
      return;
    }
    if (cleaned.length > 1) {
      // Paste or fast typing landing on one box: spread across from here.
      const next = value.split("");
      while (next.length < length) next.push("");
      for (let i = 0; i < cleaned.length && index + i < length; i++) {
        next[index + i] = cleaned[i];
      }
      onChange(next.join("").replace(/\D/g, "").slice(0, length));
      focusAt(index + cleaned.length);
      return;
    }
    setDigit(index, cleaned);
    focusAt(index + 1);
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        e.preventDefault();
        setDigit(index - 1, "");
        focusAt(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(index + 1);
    }
  }

  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!text) return;
    const next = value.split("");
    while (next.length < length) next.push("");
    for (let i = 0; i < text.length && index + i < length; i++) {
      next[index + i] = text[i];
    }
    onChange(next.join("").replace(/\D/g, "").slice(0, length));
    focusAt(index + text.length);
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Verification code" id={id}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-invalid={ariaInvalid}
          value={digits[i] ?? ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-12 w-11 rounded-[10px] border-2 border-ink bg-card text-center text-lg font-bold text-ink outline-none transition-[box-shadow,transform]",
            "focus:-translate-x-px focus:-translate-y-px focus:shadow-brutal-sm",
            "disabled:cursor-not-allowed disabled:opacity-60",
            ariaInvalid ? "border-red" : undefined
          )}
        />
      ))}
    </div>
  );
}

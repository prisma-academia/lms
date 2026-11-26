"use client";

import { useState, type InputHTMLAttributes } from "react";
import { TextInput } from "@/components/form-field";
import { cn } from "@/lib/utils";

/**
 * A password field with a Show / Hide control.
 *
 * Most people type a password on a phone, where one slip is invisible and a
 * twelve-character rule makes slips likely. Letting them look is the single
 * cheapest way to cut failed sign-ins and "passwords do not match".
 *
 * The control is a real button with its state in words — "Show password" /
 * "Hide password" — and it is kept out of the form's submit path
 * (`type="button"`). `autoComplete` is the caller's: `current-password` to sign
 * in, `new-password` when choosing one, so a password manager offers the right
 * thing. Revealing the field does not change that.
 *
 * Works with react-hook-form: everything `register()` returns, including its
 * ref, is passed straight through to the input.
 */
export function PasswordInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);

  return (
    <span className="relative block">
      <TextInput
        {...props}
        type={shown ? "text" : "password"}
        // A revealed password must not be "corrected" or capitalised.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-[4.75rem]", className)}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        aria-label={shown ? "Hide password" : "Show password"}
        disabled={props.disabled}
        className="absolute right-1.5 top-1/2 flex min-h-9 min-w-14 -translate-y-1/2 items-center justify-center rounded-[8px] px-2 text-xs font-bold text-muted-foreground outline-none [touch-action:manipulation] hover:bg-muted hover:text-foreground focus-visible:outline-[3px] focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-50"
      >
        {shown ? "Hide" : "Show"}
      </button>
    </span>
  );
}

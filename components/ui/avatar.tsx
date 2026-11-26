"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** "Ada Okonkwo" → "AO"; a single name → its first two letters. */
export function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * A person: their photo where there is one, their initials where there is not
 * — or where the photo fails to load, which a short-lived signed link can.
 *
 * Decorative by default (`alt=""`): it always sits beside the person's name,
 * and announcing the name twice helps nobody.
 */
export function Avatar({
  label,
  src,
  className,
}: {
  /** The person's name; supplies the initials. */
  label: string;
  src?: string | null;
  /** Size and text size, e.g. "size-9 text-[12px]". */
  className?: string;
}) {
  // Remember WHICH url failed, so a new photo gets its own chance to load.
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = Boolean(src) && failed !== src;

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-foreground bg-primary text-[12px] font-bold text-primary-foreground",
        className
      )}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- a signed, per-user URL; the image optimizer would cache it publicly
        <img
          src={src!}
          alt=""
          width={36}
          height={36}
          className="size-full object-cover"
          onError={() => setFailed(src!)}
        />
      ) : (
        <span aria-hidden>{initials(label)}</span>
      )}
    </span>
  );
}

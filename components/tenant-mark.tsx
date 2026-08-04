import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * The tenant's mark: the uploaded logo when there is one, otherwise a tile with
 * the tenant's initial (or the product cap when there is no tenant, e.g. the
 * platform host). Shared by every shell and the auth screens so a logo uploaded
 * in settings shows up everywhere without each surface reimplementing the
 * fallback.
 *
 * Safe in both server and client components — purely presentational.
 *
 * Distinct from `lib/site/brand-mark.tsx`, which is the fixed *product* mark
 * drawn into generated icons via `next/og`.
 */
export function TenantMark({
  logoUrl,
  name,
  className,
  logoClassName,
  iconClassName,
  fallback = "letter",
  accent,
  alt = "",
}: {
  logoUrl?: string | null;
  /** Tenant name — supplies the initial for the fallback tile. */
  name?: string | null;
  /** Sizing/border classes for the box, e.g. "size-10". */
  className?: string;
  /**
   * Used instead of `className` for the logo image. Set it where a wide
   * wordmark should keep its natural aspect rather than fit a square tile.
   */
  logoClassName?: string;
  /** Sizing for the cap icon in the `cap` fallback. */
  iconClassName?: string;
  fallback?: "letter" | "cap";
  /** Background for the fallback tile; ignored when a logo is present. */
  accent?: string;
  /**
   * Defaults to decorative — every current call site renders the tenant name
   * next to the mark, so announcing it again is noise.
   */
  alt?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={alt}
        className={cn(
          "shrink-0 rounded-[10px] border-2 border-border bg-card object-contain",
          logoClassName ?? className
        )}
      />
    );
  }

  const letter = name?.trim().charAt(0).toUpperCase();
  return (
    <span
      className={cn(
        "flex shrink-0 -rotate-3 items-center justify-center rounded-[10px] border-2 border-foreground bg-primary font-heading text-primary-foreground shadow-sm",
        className
      )}
      style={accent ? { background: accent } : undefined}
    >
      {fallback === "letter" && letter ? (
        letter
      ) : (
        <Icon name="cap" className={cn("size-5", iconClassName)} />
      )}
    </span>
  );
}

import { cn } from "@/lib/utils";

/**
 * Marks a page as a preview.
 *
 * Preview routes render the real public/learner surface with nothing else around
 * them, which is the point — and also means a screenshot, a shared link or a
 * forgotten tab is indistinguishable from the live page. This strip is the only
 * thing that says otherwise, so it is deliberately unmissable and never
 * dismissible.
 */
export function PreviewBanner({
  label,
  tone = "info",
}: {
  label: string;
  tone?: "info" | "warning";
}) {
  return (
    <div
      role="status"
      className={cn(
        "sticky top-0 z-50 border-b-2 border-border px-4 py-2 text-center text-xs font-bold uppercase tracking-wide",
        tone === "warning"
          ? "bg-amber-200 text-amber-950"
          : "bg-foreground text-background"
      )}
    >
      {label}
    </div>
  );
}

import { findPageKind, type SitePageKind } from "@/lib/site/site-api";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * Whether a redesigned built-in screen is ready to replace the standard one.
 *
 * A published sign-in page replaces the standard sign-in screen for every
 * learner. If its form were missing, nobody could sign in — so the server
 * refuses to publish one that would not work, and this shows the author the
 * same list of reasons before they press Publish, in the same words.
 *
 * Ordinary pages have nothing to prove and render nothing.
 */
export function PublishChecklist({
  kind,
  problems,
  className,
}: {
  kind: SitePageKind;
  /** From `analyzeSource` — the client's live check, or the server's answer. */
  problems: string[];
  className?: string;
}) {
  const def = findPageKind(kind);
  if (def.kind === "PAGE" || !def.requiredForm) return null;

  const ready = problems.length === 0;
  const builtinPath = `${def.path}?builtin=1`;

  return (
    <div
      role="status"
      className={cn(
        "rounded-[12px] border-2 border-border p-3 text-sm",
        ready ? "bg-success/15" : "bg-warning/15",
        className
      )}
    >
      <p className="flex items-center gap-2 font-bold text-foreground">
        <Icon name={ready ? "check-circle" : "alert-triangle"} className="size-4 shrink-0" aria-hidden />
        {ready
          ? `Ready: this has everything a ${def.label.toLowerCase()} needs.`
          : `Not ready to publish. A ${def.label.toLowerCase()} needs:`}
      </p>
      {ready ? null : (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-6 text-[13px] font-medium text-foreground">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs font-medium leading-relaxed text-muted-foreground">
        {ready
          ? "Once published it replaces the standard screen at "
          : "Until it is fixed, visitors keep seeing the standard screen at "}
        <code translate="no" className="font-mono">
          {def.path}
        </code>
        . The standard screen always stays reachable at{" "}
        <code translate="no" className="font-mono">
          {builtinPath}
        </code>
        .
      </p>
    </div>
  );
}

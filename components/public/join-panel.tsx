import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { ShareDialog } from "@/components/share/share-dialog";
import { authHref } from "@/lib/auth/next-path";
import { cn } from "@/lib/utils";

/**
 * The "how do I get in" box on a public course or programme page.
 *
 * A visitor cannot enrol — there is nobody to enrol yet — so the one thing this
 * box does is get them an account and bring them back. Both buttons carry the
 * page's own address as `next`, and the copy says so, because "Sign in" on its
 * own reads like a detour away from the course they were looking at.
 *
 * Enrolment itself stays a deliberate press on the page they return to. Nothing
 * is enrolled, and nothing is charged, by following a link.
 */
export function JoinPanel({
  path,
  kind,
  title,
  priceLabel,
  paid,
  shareUrl,
  facts,
  className,
}: {
  /** This page's path, e.g. `/courses/intro`. Where the visitor comes back to. */
  path: string;
  kind: "course" | "programme";
  title: string;
  priceLabel: string;
  paid: boolean;
  /** Absolute address of this page, for the share dialog. */
  shareUrl: string;
  /** Short facts under the price: "12 lessons", "About 3 hr". */
  facts: string[];
  /** Placement only — e.g. where the panel sits in the page's column on a phone. */
  className?: string;
}) {
  return (
    <aside
      aria-label={`Join this ${kind}`}
      className={cn(
        "min-w-0 rounded-[14px] border-2 border-border bg-card p-5 shadow-md lg:sticky lg:top-24",
        className
      )}
    >
      <p className="text-[13px] font-bold text-muted-foreground">{paid ? "Price" : "Cost"}</p>
      <p className="num mt-1 font-heading text-3xl leading-none">{priceLabel}</p>

      {facts.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1.5 text-sm font-medium text-foreground">
          {facts.map((fact) => (
            <li key={fact} className="flex items-center gap-2">
              <Icon name="check" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              {fact}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex flex-col gap-2 border-t-2 border-dashed border-border pt-5">
        <Button asChild size="lg" className="w-full">
          <Link href={authHref("login", path)}>
            {paid ? "Sign in to buy" : "Sign in to enrol"}
            <Icon name="arrow-right" aria-hidden />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link href={authHref("register", path)}>Create a free account</Link>
        </Button>
        <p className="mt-1 text-[13px] font-medium text-muted-foreground">
          You&rsquo;ll come straight back to this {kind} afterwards.
          {paid ? " Nothing is charged until you choose to buy." : null}
        </p>
      </div>

      <div className="mt-4 border-t-2 border-dashed border-border pt-4">
        <ShareDialog url={shareUrl} title={title} kind={kind} triggerLabel={`Share this ${kind}`} />
      </div>
    </aside>
  );
}

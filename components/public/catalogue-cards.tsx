import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import { courseAccent, courseIcon } from "@/lib/ui/course-color";
import { formatPrice, isPaid, plural } from "@/lib/site/public-format";
import type { PublicCourseCard, PublicProgrammeCard } from "@/lib/site/public-catalog";

/**
 * Cards for the public catalogue. Server components: there is nothing to press
 * except the link, so nothing here needs to ship as JavaScript.
 *
 * The title is the link, stretched over the whole card with `after:inset-0` —
 * one tab stop and one clear name for a screen reader, while a mouse or a thumb
 * can land anywhere on the card.
 */

const CARD =
  "relative flex h-full flex-col rounded-[14px] border-2 border-border bg-card p-4 transition-transform duration-150 focus-within:-translate-x-0.5 focus-within:-translate-y-0.5 hover:-translate-x-0.5 hover:-translate-y-0.5";

const TITLE_LINK =
  "font-heading text-[17px] leading-tight outline-none after:absolute after:inset-0 after:rounded-[12px] hover:underline focus-visible:after:outline-[3px] focus-visible:after:outline-offset-2 focus-visible:after:outline-ring";

function Cover({ id, imageUrl }: { id: string; imageUrl: string | null }) {
  const accent = courseAccent(id);
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tenant-hosted image of unknown size
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        className="mb-3 aspect-video w-full rounded-[10px] border-2 border-border object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden
      className="mb-3 flex aspect-video items-center justify-center rounded-[10px] border-2 border-border text-foreground"
      style={{ background: accent }}
    >
      <Icon name={courseIcon(id)} className="size-8" />
    </div>
  );
}

export function PublicCourseCardView({
  course,
  locale,
}: {
  course: PublicCourseCard;
  locale?: string | null;
}) {
  return (
    <article className={CARD} style={{ boxShadow: `6px 6px 0 ${courseAccent(course.id)}` }}>
      <Cover id={course.id} imageUrl={course.thumbnailUrl} />
      <h3>
        <Link href={`/courses/${course.slug}`} className={TITLE_LINK}>
          {course.title}
        </Link>
      </h3>
      {course.description ? (
        <p className="mt-1.5 line-clamp-3 text-sm font-medium text-muted-foreground">
          {course.description}
        </p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-[12px] font-bold text-muted-foreground">
        <span>{plural(course.lessonCount, "lesson")}</span>
        <Badge color={isPaid(course.priceCents) ? "var(--warning)" : "var(--success)"}>
          {formatPrice(course.priceCents, course.currency, locale)}
        </Badge>
      </div>
    </article>
  );
}

export function PublicProgrammeCardView({
  programme,
  locale,
}: {
  programme: PublicProgrammeCard;
  locale?: string | null;
}) {
  return (
    <article className={`${CARD} shadow-md`}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0">
          <Link href={`/programmes/${programme.slug}`} className={TITLE_LINK}>
            {programme.title}
          </Link>
        </h3>
        <Badge color={isPaid(programme.priceCents) ? "var(--warning)" : "var(--success)"}>
          {formatPrice(programme.priceCents, programme.currency, locale)}
        </Badge>
      </div>
      {programme.description ? (
        <p className="mt-1.5 line-clamp-3 text-sm font-medium text-muted-foreground">
          {programme.description}
        </p>
      ) : null}
      <p className="mt-auto pt-4 text-[12px] font-bold text-muted-foreground">
        {plural(programme.courseCount, "course")}
      </p>
    </article>
  );
}

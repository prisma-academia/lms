import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/icon";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import { publicUrlForKey, s3Configured } from "@/lib/storage/s3";
import type { SiteBlock } from "@/lib/site/blocks";
import { LandingHero } from "@/components/tenant/landing-hero";
import { LandingAbout } from "@/components/tenant/landing-about";
import {
  LandingCourses,
  type LandingCourse,
} from "@/components/tenant/landing-courses";
import { SectionLabel } from "@/components/tenant/section-label";

export type SiteRenderContext = {
  orgName: string;
  logoUrl: string | null;
  location: string | null;
  companyEmail: string | null;
  companyPhone: string | null;
  website: string | null;
  addressLines: string[];
  courses: LandingCourse[];
};

function CtaButtons({
  ctas,
}: {
  ctas: { label: string; href: string; variant?: "primary" | "outline" | "secondary" }[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {ctas.map((c) => (
        <Button
          key={`${c.href}-${c.label}`}
          size="lg"
          variant={c.variant === "primary" ? "default" : c.variant ?? "default"}
          asChild
        >
          <Link href={c.href}>{c.label}</Link>
        </Button>
      ))}
    </div>
  );
}

export function SiteBlocksRenderer({
  blocks,
  ctx,
}: {
  blocks: SiteBlock[];
  ctx: SiteRenderContext;
}) {
  return (
    <>
      {blocks.map((block) => {
        switch (block.type) {
          case "hero":
            return (
              <LandingHero
                key={block.id}
                name={ctx.orgName}
                logoUrl={block.showLogo ? ctx.logoUrl : null}
                location={block.showLocation ? ctx.location : null}
                hasCourses={ctx.courses.length > 0}
                headline={block.headline}
                subcopy={block.subcopy}
                ctas={block.ctas.length > 0 ? block.ctas : undefined}
              />
            );
          case "about":
            return (
              <div key={block.id}>
                {block.body ? (
                  <section className="border-t-2 border-border">
                    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
                      {block.title ? (
                        <h2 className="font-heading text-2xl">{block.title}</h2>
                      ) : null}
                      <p className="mt-3 font-medium text-muted-foreground whitespace-pre-wrap">
                        {block.body}
                      </p>
                    </div>
                  </section>
                ) : null}
                {block.showContact ? (
                  <LandingAbout
                    companyEmail={ctx.companyEmail}
                    companyPhone={ctx.companyPhone}
                    website={ctx.website}
                    addressLines={ctx.addressLines}
                  />
                ) : null}
              </div>
            );
          case "benefits":
            return (
              <section key={block.id} className="border-t-2 border-border">
                <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
                  <div className="text-center">
                    <SectionLabel>Benefits</SectionLabel>
                    <h2 className="mt-4 font-heading text-3xl">
                      {block.title ?? "Why learn with us"}
                    </h2>
                  </div>
                  <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {block.items.map((item) => (
                      <div
                        key={item.title}
                        className="rounded-[14px] border-2 border-border bg-card p-5"
                      >
                        {item.icon ? (
                          <Icon
                            name={(item.icon as IconName) || "book"}
                            className="mb-3 size-6"
                          />
                        ) : null}
                        <h3 className="font-heading text-lg">{item.title}</h3>
                        <p className="mt-2 text-sm font-medium text-muted-foreground">
                          {item.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          case "courses":
            return (
              <LandingCourses
                key={block.id}
                courses={ctx.courses.slice(0, block.limit)}
                title={block.title}
              />
            );
          case "steps":
            return (
              <section key={block.id} className="border-t-2 border-border bg-card">
                <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
                  <div className="text-center">
                    <SectionLabel>Steps</SectionLabel>
                    <h2 className="mt-4 font-heading text-3xl">
                      {block.title ?? "How it works"}
                    </h2>
                  </div>
                  <ol className="mt-10 space-y-6">
                    {block.items.map((item, i) => (
                      <li key={item.title} className="flex gap-4">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-foreground font-heading text-sm">
                          {i + 1}
                        </span>
                        <div>
                          <h3 className="font-heading text-lg">{item.title}</h3>
                          <p className="mt-1 text-sm font-medium text-muted-foreground">
                            {item.body}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {block.ctaLabel && block.ctaHref ? (
                    <div className="mt-10 text-center">
                      <Button size="lg" asChild>
                        <Link href={block.ctaHref}>{block.ctaLabel}</Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              </section>
            );
          case "faq":
            return (
              <section key={block.id} className="border-t-2 border-border">
                <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
                  <h2 className="text-center font-heading text-3xl">
                    {block.title ?? "FAQ"}
                  </h2>
                  <div className="mt-8 space-y-4">
                    {block.items.map((item) => (
                      <details
                        key={item.question}
                        className="rounded-[14px] border-2 border-border bg-card p-4"
                      >
                        <summary className="cursor-pointer font-heading text-base">
                          {item.question}
                        </summary>
                        <p className="mt-2 text-sm font-medium text-muted-foreground whitespace-pre-wrap">
                          {item.answer}
                        </p>
                      </details>
                    ))}
                  </div>
                </div>
              </section>
            );
          case "cta":
            return (
              <section key={block.id} className="border-t-2 border-border bg-card">
                <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
                  <h2 className="font-heading text-3xl">{block.headline}</h2>
                  {block.subcopy ? (
                    <p className="mt-3 font-medium text-muted-foreground">{block.subcopy}</p>
                  ) : null}
                  <div className="mt-8">
                    <CtaButtons ctas={block.ctas} />
                  </div>
                </div>
              </section>
            );
          case "richText":
          case "html":
            return (
              <section key={block.id} className="border-t-2 border-border">
                <div
                  className="prose prose-stone mx-auto max-w-3xl px-4 py-10 sm:px-6"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.html) }}
                />
              </section>
            );
          case "image": {
            const url =
              block.imageKey && s3Configured()
                ? publicUrlForKey(block.imageKey)
                : null;
            if (!url) return null;
            return (
              <section key={block.id} className="border-t-2 border-border">
                <figure className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={block.alt ?? ""}
                    className="w-full rounded-[14px] border-2 border-border object-cover"
                  />
                  {block.caption ? (
                    <figcaption className="mt-2 text-center text-sm text-muted-foreground">
                      {block.caption}
                    </figcaption>
                  ) : null}
                </figure>
              </section>
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}

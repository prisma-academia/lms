import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { Decor } from "@/components/marketing/decor";

type Cta = {
  label: string;
  href: string;
  variant?: "primary" | "outline" | "secondary";
};

type Props = {
  name: string;
  logoUrl: string | null;
  location: string | null;
  hasCourses: boolean;
  headline?: string;
  subcopy?: string;
  ctas?: Cta[];
};

export function LandingHero({
  name,
  logoUrl,
  location,
  hasCourses,
  headline,
  subcopy,
  ctas,
}: Props) {
  const title = headline?.trim() || name;
  const body =
    subcopy?.trim() ||
    "Welcome to your learning home. Enroll in courses, track your progress, and grow with us.";

  return (
    <section className="relative overflow-hidden">
      <Decor preset="tenant" />
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="mx-auto mb-6 size-20 rounded-[14px] border-2 border-border object-contain shadow-sm"
            />
          ) : (
            <div className="mx-auto mb-6 flex size-20 -rotate-3 items-center justify-center rounded-[14px] border-2 border-foreground font-heading text-3xl text-foreground shadow-sm">
              {name.charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className="font-heading text-4xl leading-[1.05] sm:text-5xl">{title}</h1>

          {location ? (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground">
              <Icon name="globe" className="size-4 shrink-0" />
              {location}
            </p>
          ) : null}

          <p className="mt-5 text-lg font-medium text-muted-foreground">{body}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {ctas && ctas.length > 0 ? (
              ctas.map((c) => (
                <Button
                  key={`${c.href}-${c.label}`}
                  size="lg"
                  variant={
                    c.variant === "primary"
                      ? "default"
                      : c.variant === "outline"
                        ? "outline"
                        : c.variant === "secondary"
                          ? "secondary"
                          : "default"
                  }
                  asChild
                >
                  <Link href={c.href}>
                    {c.label}
                    {c.variant !== "outline" && c.variant !== "secondary" ? (
                      <Icon name="arrow-right" />
                    ) : null}
                  </Link>
                </Button>
              ))
            ) : (
              <>
                <Button size="lg" asChild>
                  <Link href="/auth/register">
                    Enroll now <Icon name="arrow-right" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/auth/login">Sign in</Link>
                </Button>
                {hasCourses ? (
                  <Button size="lg" variant="secondary" asChild>
                    <a href="#courses">View courses</a>
                  </Button>
                ) : null}
              </>
            )}
          </div>

          <p className="mt-4 text-[13px] font-medium text-muted-foreground">
            Already enrolled?{" "}
            <Link
              href="/auth/login"
              className="font-bold underline decoration-primary decoration-2 underline-offset-2 hover:text-foreground"
            >
              Sign in to your account
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

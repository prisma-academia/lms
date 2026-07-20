import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { Decor } from "@/components/marketing/decor";
import { SectionLabel } from "./section-label";

const STEPS = [
  {
    color: "var(--chart-1)",
    title: "Create your account",
    body: "Sign up with your email in minutes — it's free to get started.",
  },
  {
    color: "var(--chart-2)",
    title: "Browse the catalog",
    body: "Explore available courses and pick the ones that match your goals.",
  },
  {
    color: "var(--chart-3)",
    title: "Start learning",
    body: "Enroll, complete lessons, and track your progress all in one place.",
  },
] as const;

export function LandingSteps() {
  return (
    <>
      <section id="get-started" className="scroll-mt-24 border-t-2 border-border">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mt-4 font-heading text-3xl">
              Get started in three steps
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="flex flex-col gap-4 rounded-[14px] border-2 border-border bg-card p-5 text-card-foreground shadow-sm"
              >
                <span
                  className="num flex size-11 shrink-0 -rotate-3 items-center justify-center rounded-[12px] border-2 border-foreground font-heading text-xl text-foreground"
                  style={{ background: step.color }}
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-heading text-base leading-tight">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm font-medium text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t-2 border-border bg-card text-card-foreground">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
          <div
            className="relative mx-auto max-w-2xl overflow-hidden rounded-[18px] border-2 border-foreground p-8 shadow-lg sm:p-10"
          >
            <Decor preset="cta" />
            <h2 className="font-heading text-3xl leading-tight">
              Ready to begin?
            </h2>
            <p className="mx-auto mt-2 max-w-md font-medium text-muted-foreground">
              Join our learning community today. Create your account and enroll
              in your first course.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/auth/register">
                  Enroll now <Icon name="arrow-right" />
                </Link>
              </Button>
              <Button size="lg" variant="secondary" asChild>
                <Link href="/auth/login">Sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

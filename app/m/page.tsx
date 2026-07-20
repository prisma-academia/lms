import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/icon";
import { env } from "@/lib/env";
import { getPublicMarketingPlans } from "@/lib/marketing/plans";
import { RegisterDialog } from "./register/register-dialog";
import { HeroArt } from "@/components/marketing/hero-art";
import { Decor } from "@/components/marketing/decor";

const FEATURES: { icon: IconName; color: string; title: string; body: string }[] =
  [
    {
      icon: "book",
      color: "var(--chart-1)",
      title: "Learning content",
      body: "Courses, programmes, lessons, and a shared resource library.",
    },
    {
      icon: "clipboard",
      color: "var(--chart-2)",
      title: "Quizzes & assignments",
      body: "Question banks, in-lesson quizzes, graded work, and feedback.",
    },
    {
      icon: "cap",
      color: "var(--chart-3)",
      title: "Learner portal",
      body: "Catalog, enrollments, progress tracking, and self-service access.",
    },
    {
      icon: "award",
      color: "var(--chart-4)",
      title: "Certificates",
      body: "Award credentials when learners complete requirements.",
    },
    {
      icon: "calendar",
      color: "var(--chart-5)",
      title: "Stay connected",
      body: "Calendar, messages, and notifications keep everyone aligned.",
    },
    {
      icon: "users",
      color: "var(--chart-1)",
      title: "Run your organization",
      body: "People, groups, roles, enrollments, and built-in billing.",
    },
  ];

const PORTALS: {
  icon: IconName;
  color: string;
  title: string;
  body: string;
  bullets: string[];
}[] = [
  {
    icon: "settings",
    color: "var(--chart-1)",
    title: "Admin console",
    body: "Your team manages everything from one place on your branded workspace.",
    bullets: [
      "Content, programmes, and resources",
      "Learners, staff, and groups",
      "Assessments, grades, and certificates",
      "Roles, billing, and settings",
    ],
  },
  {
    icon: "cap",
    color: "var(--chart-2)",
    title: "Learner portal",
    body: "Learners sign in on your workspace to learn, submit work, and track progress.",
    bullets: [
      "Browse catalog and enroll",
      "Complete lessons and quizzes",
      "Submit assignments and view grades",
      "Calendar, messages, and certificates",
    ],
  },
];

const STEPS: { color: string; title: string; body: string }[] = [
  {
    color: "var(--chart-1)",
    title: "Create your workspace",
    body: "Register your organization and get a dedicated workspace with admin and learner portals.",
  },
  {
    color: "var(--chart-2)",
    title: "Build your learning catalog",
    body: "Add courses and programmes, upload resources, and publish offerings to your catalog.",
  },
  {
    color: "var(--chart-3)",
    title: "Onboard learners and grow",
    body: "Invite or enroll learners, track progress, and scale with plans that fit your needs.",
  },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex -rotate-1 items-center rounded-md border-2 border-border bg-card px-3 py-1 text-[12px] font-bold text-card-foreground shadow-sm">
      {children}
    </span>
  );
}

export default async function MarketingHomePage() {
  const plans = await getPublicMarketingPlans();

  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <Decor preset="hero" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-8">
            <div className="text-center lg:text-left">
              <span className="inline-flex -rotate-1 items-center gap-1.5 rounded-md border-2 border-foreground bg-primary px-3 py-1 text-[12px] font-bold text-primary-foreground shadow-sm">
                <Icon name="flame" className="size-3.5" /> Learning management
                platform
              </span>
              <h1 className="mt-6 font-heading text-4xl leading-[1.05] sm:text-6xl lg:mx-0">
                Everything you need to run learning online
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-muted-foreground lg:mx-0">
                Deliver content, manage people, assess learners, keep everyone
                engaged, and handle payments — all on a branded workspace with
                admin and learner portals built in.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <RegisterDialog size="lg">
                  Start free trial <Icon name="arrow-right" />
                </RegisterDialog>
                <Button size="lg" variant="outline" asChild>
                  <a href="#pricing">View pricing</a>
                </Button>
              </div>
              <p className="num mt-4 text-sm font-bold text-muted-foreground">
                {env.TENANT_TRIAL_DAYS}-day free trial · storage included · no
                card required
              </p>
            </div>

            <div className="order-first lg:order-last">
              <HeroArt className="mx-auto w-full max-w-md lg:max-w-none" />
            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-3">
            {[
              { icon: "globe" as IconName, label: "Your own workspace", color: "var(--chart-1)" },
              { icon: "layers" as IconName, label: "Admin + learner portals", color: "var(--chart-2)" },
              { icon: "trending-up" as IconName, label: "Scales as you grow", color: "var(--chart-3)" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center gap-2 rounded-[14px] border-2 border-border bg-card p-4 text-center text-card-foreground shadow-sm"
              >
                <span
                  className="flex size-9 items-center justify-center rounded-[10px] border-2 border-foreground text-foreground"
                  style={{ background: s.color }}
                >
                  <Icon name={s.icon} className="size-[18px]" />
                </span>
                <span className="text-[12px] font-bold leading-tight text-muted-foreground">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 border-t-2 border-border bg-card text-card-foreground">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <div className="text-center">
            <SectionLabel>Capabilities</SectionLabel>
            <h2 className="mt-4 font-heading text-3xl">
              One platform, built to grow with you
            </h2>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-[14px] border-2 border-border bg-background p-5 shadow-md transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
              >
                <span
                  className="flex size-11 items-center justify-center rounded-[10px] border-2 border-foreground text-foreground"
                  style={{ background: f.color }}
                >
                  <Icon name={f.icon} className="size-5" />
                </span>
                <h3 className="mt-3 font-heading text-base leading-tight">
                  {f.title}
                </h3>
                <p className="mt-1.5 text-sm font-medium text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two portals */}
      <section id="portals" className="scroll-mt-24 border-t-2 border-border">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <SectionLabel>Two portals</SectionLabel>
            <h2 className="mt-4 font-heading text-3xl">
              One workspace, two experiences
            </h2>
            <p className="mx-auto mt-2 max-w-2xl font-medium text-muted-foreground">
              Your organization gets a branded workspace. Staff and learners each
              sign in to the portal built for their role.
            </p>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {PORTALS.map((portal) => (
              <div
                key={portal.title}
                className="rounded-[14px] border-2 border-border bg-card p-6 text-card-foreground shadow-md"
              >
                <span
                  className="flex size-11 items-center justify-center rounded-[10px] border-2 border-foreground text-foreground"
                  style={{ background: portal.color }}
                >
                  <Icon name={portal.icon} className="size-5" />
                </span>
                <h3 className="mt-4 font-heading text-xl leading-tight">
                  {portal.title}
                </h3>
                <p className="mt-2 text-sm font-medium text-muted-foreground">
                  {portal.body}
                </p>
                <ul className="mt-4 flex flex-col gap-2 text-[13px] font-medium text-muted-foreground">
                  {portal.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <Icon
                        name="check"
                        className="mt-0.5 size-4 shrink-0 text-success"
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 border-t-2 border-border bg-card text-card-foreground">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <SectionLabel>How it works</SectionLabel>
            <h2 className="mt-4 font-heading text-3xl">
              From sign-up to learners in three steps
            </h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="flex flex-col gap-4 rounded-[14px] border-2 border-border bg-background p-5 shadow-sm"
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

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 border-t-2 border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <SectionLabel>Pricing</SectionLabel>
            <h2 className="mt-4 font-heading text-3xl">
              Plans that scale with you
            </h2>
            <p className="mx-auto mt-2 max-w-2xl font-medium text-muted-foreground">
              Start with a {env.TENANT_TRIAL_DAYS}-day free trial. Upgrade when
              you need more learners, courses, or storage.
            </p>
          </div>
          {plans.length > 0 ? (
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const dark = plan.highlighted;
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-[14px] border-2 p-5 ${
                      dark
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-card-foreground"
                    }`}
                    /* Per-plan accent offset shadow. Still theme-driven — plan.accent
                       is a --chart-N var, so each preset restyles it. Without this the
                       pricing cards all render identically. */
                    style={{ boxShadow: `6px 6px 0 ${plan.accent}` }}
                  >
                    {dark ? (
                      <span className="absolute -top-3 left-5 -rotate-2 rounded-md border-2 border-foreground bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                        Most popular
                      </span>
                    ) : null}
                    <h3 className="font-heading text-lg">{plan.name}</h3>
                    <p
                      className={`mt-1 text-[13px] font-medium ${dark ? "text-background" : "text-muted-foreground"}`}
                    >
                      {plan.description}
                    </p>
                    <p className="mt-4 font-heading text-3xl leading-none">
                      {plan.price}
                      <span
                        className={`text-base font-medium ${dark ? "text-background" : "text-muted-foreground"}`}
                      >
                        {plan.period}
                      </span>
                    </p>
                    <p
                      className={`num mt-2 text-[13px] font-bold ${dark ? "text-background" : "text-muted-foreground"}`}
                    >
                      {plan.storage} storage
                    </p>
                    <ul className="mt-4 flex flex-1 flex-col gap-2 text-[13px] font-medium">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Icon
                            name="check"
                            className={`mt-0.5 size-4 shrink-0 ${dark ? "text-background" : "text-success"}`}
                          />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <RegisterDialog
                      className="mt-5 w-full"
                      variant={dark ? "default" : "outline"}
                    >
                      {plan.ctaLabel}
                    </RegisterDialog>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-10 text-center font-medium text-muted-foreground">
              Plans are being updated. Start your free trial to get started.
            </p>
          )}
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t-2 border-border bg-card text-card-foreground">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
          <div className="relative mx-auto max-w-2xl overflow-hidden rounded-[18px] border-2 border-foreground bg-primary p-8 text-primary-foreground shadow-lg sm:p-10">
            <Decor preset="cta" />
            <h2 className="font-heading text-3xl leading-tight">
              Ready to launch your learning platform?
            </h2>
            <p className="mx-auto mt-2 max-w-md font-medium text-primary-foreground">
              Register your organization now — you&apos;ll be building your
              learning catalog in minutes.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <RegisterDialog size="lg">
                Register your organization <Icon name="arrow-right" />
              </RegisterDialog>
              <Button size="lg" variant="secondary" asChild>
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

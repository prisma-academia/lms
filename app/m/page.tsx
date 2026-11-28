import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/icon";
import { apexHostname, env } from "@/lib/env";
import { getPublicMarketingPlans, type MarketingPlanCard } from "@/lib/marketing/plans";
import { requestOrigin } from "@/lib/site/metadata";
import { RegisterDialog } from "./register/register-dialog";
import { HeroArt } from "@/components/marketing/hero-art";
import { ExamArt } from "@/components/marketing/exam-art";
import { SiteArt } from "@/components/marketing/site-art";
import { Decor } from "@/components/marketing/decor";
import {
  EXAM_POINTS,
  INTEGRATIONS,
  PILLARS,
  PORTALS,
  SITE_POINTS,
  STEPS,
  WEBHOOK_EVENTS,
  buildFaqs,
  type Faq,
} from "./content";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Section index under the hero: real links into the page, not decoration. */
const JUMP_LINKS: { href: string; icon: IconName; label: string; color: string }[] = [
  { href: "#exams", icon: "clipboard", label: "CBT exams", color: "var(--chart-2)" },
  { href: "#website", icon: "globe", label: "Website builder", color: "var(--chart-4)" },
  { href: "#features", icon: "wallet", label: "Online payments", color: "var(--chart-5)" },
  { href: "#integrations", icon: "code", label: "API and integrations", color: "var(--chart-1)" },
];

function jsonLd(origin: URL, plans: MarketingPlanCard[], faqs: Faq[], description: string) {
  const home = new URL("/", origin).toString();
  const orgId = `${home}#organization`;
  const offers = plans
    .filter((p) => p.monthlyAmount !== null)
    .map((p) => ({
      "@type": "Offer",
      name: p.name,
      description: p.description,
      price: p.monthlyAmount,
      priceCurrency: p.currency,
      url: `${home}#pricing`,
    }));

  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: env.PRODUCT_NAME,
        url: home,
        logo: new URL("/apple-icon", origin).toString(),
      },
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        name: env.PRODUCT_NAME,
        url: home,
        publisher: { "@id": orgId },
      },
      {
        "@type": "SoftwareApplication",
        name: env.PRODUCT_NAME,
        url: home,
        description,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web browser",
        publisher: { "@id": orgId },
        featureList: PILLARS.flatMap((p) => p.bullets),
        ...(offers.length > 0 ? { offers } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  // `<` escaped so no string in the data can close the script element.
  return JSON.stringify(graph).replace(/</g, "\\u003c");
}

export default async function MarketingHomePage() {
  const [plans, origin] = await Promise.all([getPublicMarketingPlans(), requestOrigin()]);
  const host = apexHostname();
  const trialDays = env.TENANT_TRIAL_DAYS;
  const faqs = buildFaqs(trialDays, host);
  const lead = `${env.PRODUCT_NAME} is a learning management system for schools, training providers and exam bodies. Build courses, run proctored CBT exams, publish your website and take payments, all on your own branded address.`;

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(origin, plans, faqs, lead) }}
      />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <Decor preset="hero" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-8">
            <div className="text-center lg:text-left">
              <span className="inline-flex -rotate-1 items-center gap-1.5 rounded-md border-2 border-foreground bg-primary px-3 py-1 text-[12px] font-bold text-primary-foreground shadow-sm">
                <Icon name="flame" className="size-3.5" /> Learning management system
              </span>
              <h1 className="mt-6 font-heading text-4xl leading-[1.05] sm:text-6xl">
                Teach, test and sell from one online academy
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-lg font-medium text-muted-foreground lg:mx-0">
                {lead}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <RegisterDialog size="lg">
                  Start free trial <Icon name="arrow-right" />
                </RegisterDialog>
                <Button size="lg" variant="outline" asChild>
                  <a href="#features">Explore features</a>
                </Button>
              </div>
              <p className="num mt-4 text-sm font-bold text-muted-foreground">
                Free for {trialDays} days. No card needed.
              </p>
            </div>

            <div className="order-first lg:order-last">
              <HeroArt className="mx-auto w-full max-w-md lg:max-w-none" />
            </div>
          </div>

          <nav aria-label="Highlights" className="mx-auto mt-14 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {JUMP_LINKS.map((s) => (
              <a
                key={s.href}
                href={s.href}
                className="group flex items-center gap-2.5 rounded-[14px] border-2 border-border bg-card p-3 text-card-foreground shadow-sm transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-foreground text-foreground"
                  style={{ background: s.color }}
                >
                  <Icon name={s.icon} className="size-[18px]" />
                </span>
                <span className="text-[13px] font-bold leading-tight">{s.label}</span>
              </a>
            ))}
          </nav>
        </div>
      </section>

      {/* Feature pillars — one panel split into cells, so the six read as parts of one system */}
      <section id="features" className="scroll-mt-24 border-t-2 border-border bg-card text-card-foreground">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="font-heading text-3xl sm:text-4xl">Everything your academy runs on</h2>
            <p className="mt-3 font-medium text-muted-foreground">
              Six parts of one system. They share the same learners, courses and
              records, so nothing needs copying between tools.
            </p>
          </div>
          <div className="mt-10 grid gap-[2px] overflow-hidden rounded-[16px] border-2 border-foreground bg-foreground shadow-md sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.id} className="flex flex-col bg-background p-6">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-foreground text-foreground"
                    style={{ background: p.color }}
                  >
                    <Icon name={p.icon} className="size-5" />
                  </span>
                  <h3 className="font-heading text-xl leading-tight">{p.title}</h3>
                </div>
                <p className="mt-3 text-sm font-bold">{p.body}</p>
                <ul className="mt-3 flex flex-col gap-2 text-[13px] font-medium text-muted-foreground">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <Icon name="check" className="mt-0.5 size-4 shrink-0 text-success" />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CBT spotlight — the one inverted band on the page */}
      <section id="exams" className="scroll-mt-24 border-t-2 border-foreground bg-foreground text-background">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <span className="inline-flex -rotate-1 items-center gap-1.5 rounded-md border-2 border-background bg-[var(--chart-2)] px-3 py-1 text-[12px] font-bold text-foreground">
              <Icon name="monitor" className="size-3.5" /> Computer-based testing
            </span>
            <h2 className="mt-5 font-heading text-3xl leading-tight sm:text-4xl">
              CBT exams that hold up on exam day
            </h2>
            <p className="mt-3 max-w-xl font-medium text-background/80">
              Set papers from your question banks, schedule them, and let
              candidates sit them in a locked-down browser. Marks, integrity
              flags and analytics are waiting when time runs out.
            </p>
            <dl className="mt-8 grid gap-6 sm:grid-cols-2">
              {EXAM_POINTS.map((pt) => (
                <div key={pt.title}>
                  <dt className="flex items-center gap-2 font-heading text-base">
                    <Icon name={pt.icon} className="size-5 shrink-0 text-[var(--chart-2)]" />
                    {pt.title}
                  </dt>
                  <dd className="mt-1.5 text-sm font-medium text-background/75">{pt.body}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ExamArt className="mx-auto w-full max-w-lg" />
        </div>
      </section>

      {/* Website builder spotlight */}
      <section id="website" className="scroll-mt-24 border-t-2 border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
          <SiteArt host={host} className="order-last mx-auto w-full max-w-lg lg:order-first" />
          <div>
            <h2 className="font-heading text-3xl leading-tight sm:text-4xl">
              Your academy&apos;s website, without a web developer
            </h2>
            <p className="mt-3 max-w-xl font-medium text-muted-foreground">
              Every academy gets a public website at its own address, with
              course and programme pages that lead straight to enrollment and
              checkout.
            </p>
            <ul className="mt-6 flex flex-col gap-3 font-medium">
              {SITE_POINTS.map((pt) => (
                <li key={pt} className="flex items-start gap-2.5">
                  <Icon name="check" className="mt-0.5 size-5 shrink-0 text-success" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Developers & integrations */}
      <section id="integrations" className="scroll-mt-24 border-t-2 border-border bg-card text-card-foreground">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div className="min-w-0">
            <h2 className="font-heading text-3xl leading-tight sm:text-4xl">
              Works with the tools you already use
            </h2>
            <p className="mt-3 max-w-xl font-medium text-muted-foreground">
              Send alerts to your team chat, run live classes on Zoom, and let
              staff sign in with your existing accounts.
            </p>
            <ul className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {INTEGRATIONS.map((it) => (
                <li
                  key={it.name}
                  className="flex items-center gap-2.5 rounded-[10px] border-2 border-border bg-background px-3 py-2"
                >
                  <Icon name={it.icon} className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-bold leading-tight">{it.name}</span>
                    <span className="text-[11px] font-bold text-muted-foreground">{it.kind}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-w-0 flex-col justify-center">
            <h3 className="font-heading text-xl">A Developer API for everything else</h3>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              Read and write learners, enrollments, courses, exams, payments and
              certificates over REST, with an OpenAPI description. Webhooks are
              signed with HMAC and retried for almost two days if your server is down.
            </p>
            <div
              className="mt-5 overflow-hidden rounded-[14px] border-2 border-foreground bg-foreground text-background"
              style={{ boxShadow: "6px 6px 0 var(--chart-1)" }}
            >
              <pre className="overflow-x-auto p-4 font-mono text-[12px] leading-relaxed">
                <code>
                  {`curl https://youracademy.${host}/api/v1/learners \\\n  -H "Authorization: Bearer plms_live_…"`}
                </code>
              </pre>
              <div className="border-t-2 border-background/20 p-4">
                <p className="text-[11px] font-bold text-background/70">Webhook events include</p>
                <ul className="mt-2 flex flex-wrap gap-1.5 font-mono text-[11px]">
                  {WEBHOOK_EVENTS.map((e) => (
                    <li key={e} className="rounded border border-background/30 px-1.5 py-0.5">
                      {e}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two portals */}
      <section id="portals" className="scroll-mt-24 border-t-2 border-border">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <h2 className="font-heading text-3xl">One academy, two portals</h2>
            <p className="mx-auto mt-2 max-w-2xl font-medium text-muted-foreground">
              Staff and learners sign in at the same address and each see the
              portal built for their role.
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
                <h3 className="mt-4 font-heading text-xl leading-tight">{portal.title}</h3>
                <p className="mt-2 text-sm font-medium text-muted-foreground">{portal.body}</p>
                <ul className="mt-4 flex flex-col gap-2 text-[13px] font-medium text-muted-foreground">
                  {portal.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <Icon name="check" className="mt-0.5 size-4 shrink-0 text-success" />
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
          <h2 className="text-center font-heading text-3xl">Open your academy in three steps</h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-4 rounded-[14px] border-2 border-border bg-background p-5 shadow-sm"
              >
                <span
                  className="num flex size-11 shrink-0 -rotate-3 items-center justify-center rounded-[12px] border-2 border-foreground font-heading text-xl text-foreground"
                  style={{ background: step.color }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-heading text-base leading-tight">{step.title}</h3>
                  <p className="mt-1.5 text-sm font-medium text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-24 border-t-2 border-border">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="text-center">
            <h2 className="font-heading text-3xl">Plans that scale with you</h2>
            <p className="mx-auto mt-2 max-w-2xl font-medium text-muted-foreground">
              Every plan includes CBT exams, the website builder and online
              payments. Start with a {trialDays}-day free trial and upgrade when
              you need more learners, courses or storage.
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

      {/* FAQ — the same strings feed the FAQPage JSON-LD above */}
      <section id="faq" className="scroll-mt-24 border-t-2 border-border bg-card text-card-foreground">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-center font-heading text-3xl">Questions academies ask</h2>
          <div className="mt-10 flex flex-col gap-3">
            {faqs.map((f) => (
              <details
                key={f.q}
                className="group rounded-[14px] border-2 border-border bg-background open:border-foreground open:shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-[12px] px-5 py-4 font-heading text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <h3>{f.q}</h3>
                  <Icon
                    name="chevron-down"
                    className="size-5 shrink-0 transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="px-5 pb-5 text-sm font-medium text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t-2 border-border">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
          <div className="relative mx-auto max-w-2xl overflow-hidden rounded-[18px] border-2 border-foreground bg-primary p-8 text-primary-foreground shadow-lg sm:p-10">
            <Decor preset="cta" />
            <h2 className="font-heading text-3xl leading-tight">Open your academy today</h2>
            <p className="mx-auto mt-2 max-w-md font-medium text-primary-foreground">
              Register your organization and start building courses and exams
              in minutes. Free for {trialDays} days.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <RegisterDialog size="lg">
                Register your organization <Icon name="arrow-right" />
              </RegisterDialog>
              <Button size="lg" variant="secondary" asChild>
                <a href="#faq">Read the FAQ</a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

import { Icon, type IconName } from "@/components/icon";
import { SectionLabel } from "./section-label";

const BENEFITS: { icon: IconName; color: string; title: string; body: string }[] =
  [
    {
      icon: "book",
      color: "var(--purple)",
      title: "Course catalog",
      body: "Browse published courses and programmes tailored to your goals.",
    },
    {
      icon: "chart",
      color: "var(--blue)",
      title: "Track progress",
      body: "See how far you've come with lesson completion and progress bars.",
    },
    {
      icon: "award",
      color: "var(--green)",
      title: "Earn certificates",
      body: "Receive credentials when you complete course requirements.",
    },
    {
      icon: "clipboard",
      color: "var(--yellow)",
      title: "Quizzes & assignments",
      body: "Test your knowledge and submit work with instructor feedback.",
    },
    {
      icon: "calendar",
      color: "var(--pink)",
      title: "Stay on schedule",
      body: "View events and deadlines so you never miss an important date.",
    },
    {
      icon: "bell",
      color: "var(--orange)",
      title: "Messages & updates",
      body: "Get notified and stay connected with your instructors.",
    },
  ];

export function LandingBenefits() {
  return (
    <section id="benefits" className="scroll-mt-24 border-t-2 border-ink">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <SectionLabel>Why learn with us</SectionLabel>
          <h2 className="mt-4 font-heading text-3xl">
            Everything you need to succeed
          </h2>
          <p className="mx-auto mt-2 max-w-2xl font-medium text-ink/70">
            Your learner portal gives you one place to study, submit work, and
            track your achievements.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((f) => (
            <div
              key={f.title}
              className="rounded-[14px] border-2 border-ink bg-card p-5 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
              style={{ boxShadow: `5px 5px 0 ${f.color}` }}
            >
              <span
                className="flex size-11 items-center justify-center rounded-[10px] border-2 border-ink text-ink"
                style={{ background: f.color }}
              >
                <Icon name={f.icon} className="size-5" />
              </span>
              <h3 className="mt-3 font-heading text-base leading-tight">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm font-medium text-ink/60">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

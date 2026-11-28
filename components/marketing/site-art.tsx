import { Icon } from "@/components/icon";

/**
 * A static mock of an academy website being edited in the site builder: the
 * page in a browser frame, with the section manager and the AI prompt beside
 * it. Decorative; the copy next to it carries the meaning.
 */

const SECTIONS = [
  { name: "Hero", visible: true },
  { name: "Featured courses", visible: true },
  { name: "Testimonials", visible: false },
  { name: "FAQ", visible: true },
];

export function SiteArt({ host, className }: { host: string; className?: string }) {
  return (
    <div aria-hidden="true" className={`relative pb-10 sm:pb-0 sm:pr-16 ${className ?? ""}`}>
      {/* browser frame */}
      <div
        className="overflow-hidden rounded-[16px] border-2 border-foreground bg-card text-card-foreground"
        style={{ boxShadow: "8px 8px 0 var(--chart-4)" }}
      >
        <div className="flex items-center gap-2 border-b-2 border-foreground bg-background px-3 py-2">
          <span className="flex gap-1">
            <span className="size-2.5 rounded-full border-2 border-foreground bg-[var(--chart-3)]" />
            <span className="size-2.5 rounded-full border-2 border-foreground bg-primary" />
            <span className="size-2.5 rounded-full border-2 border-foreground bg-[var(--chart-1)]" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border-2 border-border bg-card px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
            <Icon name="lock" className="size-3 shrink-0" />
            <span className="truncate">youracademy.{host}</span>
          </span>
        </div>

        {/* page */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <span className="h-3 w-16 rounded bg-foreground" />
            <span className="flex gap-2">
              <span className="h-2 w-8 rounded bg-border" />
              <span className="h-2 w-8 rounded bg-border" />
              <span className="h-2 w-8 rounded bg-border" />
            </span>
          </div>

          <div className="relative mt-4 rounded-[12px] border-2 border-dashed border-foreground bg-[var(--chart-2)] p-4">
            <span className="absolute -top-3 left-3 rounded border-2 border-foreground bg-card px-1.5 text-[10px] font-bold">
              Hero
            </span>
            <p className="font-heading text-base leading-tight text-foreground">Learn data skills with working mentors</p>
            <span className="mt-2 block h-2 w-3/4 rounded bg-foreground/30" />
            <span className="mt-3 inline-block rounded-md border-2 border-foreground bg-primary px-2.5 py-0.5 text-[11px] font-bold text-primary-foreground">
              Browse courses
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {["var(--chart-1)", "var(--chart-3)", "var(--chart-5)"].map((c) => (
              <div key={c} className="rounded-[10px] border-2 border-border bg-background p-1.5">
                <span className="block h-10 rounded-md border-2 border-foreground" style={{ background: c }} />
                <span className="mt-1.5 block h-2 w-4/5 rounded bg-foreground/70" />
                <span className="mt-1 block h-1.5 w-1/2 rounded bg-border" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* section manager */}
      <div className="absolute -bottom-2 right-0 w-48 rounded-[12px] border-2 border-foreground bg-card p-2.5 text-card-foreground shadow-md sm:-bottom-6">
        <p className="text-[11px] font-bold text-muted-foreground">Sections</p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <li
              key={s.name}
              className={`flex items-center gap-1.5 rounded border-2 px-1.5 py-1 text-[11px] font-bold ${
                s.name === "Hero" ? "border-foreground bg-[var(--chart-2)] text-foreground" : "border-border"
              }`}
            >
              <Icon name="grip" className="size-3 shrink-0 text-muted-foreground" />
              <span className={`flex-1 truncate ${s.visible ? "" : "text-muted-foreground line-through"}`}>{s.name}</span>
              <Icon name={s.visible ? "eye" : "eye-off"} className="size-3 shrink-0" />
            </li>
          ))}
        </ul>
        <p className="mt-2 flex items-center gap-1 rounded-md border-2 border-foreground bg-primary px-2 py-1 text-[11px] font-bold text-primary-foreground">
          <Icon name="sparkles" className="size-3 shrink-0" /> Rewrite with AI
        </p>
      </div>
    </div>
  );
}

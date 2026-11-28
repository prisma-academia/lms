import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

/** Links between an exam's builder and its operations screens. */
export function ExamOpsNav({
  examId,
  current,
  show,
}: {
  examId: string;
  current: "live" | "marking" | "results" | "attempt";
  show: { live: boolean; marking: boolean; results: boolean };
}) {
  const links: { key: string; href: string; label: string; icon: IconName; visible: boolean }[] = [
    { key: "edit", href: `/admin/exams/${examId}`, label: "Edit exam", icon: "settings", visible: true },
    { key: "live", href: `/admin/exams/${examId}/live`, label: "Live room", icon: "monitor", visible: show.live },
    { key: "marking", href: `/admin/exams/${examId}/marking`, label: "Marking", icon: "check-circle", visible: show.marking },
    { key: "results", href: `/admin/exams/${examId}/results`, label: "Results", icon: "chart", visible: show.results },
  ];
  return (
    <nav aria-label="Exam" className="mb-5 flex flex-wrap gap-2 print:hidden">
      {links
        .filter((l) => l.visible)
        .map((l) => {
          const active = l.key === current;
          return (
            <Link
              key={l.key}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border-2 border-border px-3 text-[13px] font-bold outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring",
                active ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon name={l.icon} className="size-4" />
              {l.label}
            </Link>
          );
        })}
    </nav>
  );
}

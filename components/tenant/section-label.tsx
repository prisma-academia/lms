export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex -rotate-1 items-center rounded-md border-2 border-border bg-card px-3 py-1 text-[12px] font-bold text-card-foreground shadow-sm">
      {children}
    </span>
  );
}

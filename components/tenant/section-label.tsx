export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex -rotate-1 items-center rounded-md border-2 border-ink bg-card px-3 py-1 text-[12px] font-bold shadow-brutal-sm">
      {children}
    </span>
  );
}

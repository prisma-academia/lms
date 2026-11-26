import { CardSkeleton, PageSkeleton } from "@/components/ui/skeleton";

export default function TemplateLoading() {
  return (
    <PageSkeleton label="Loading template…">
      <div className="flex flex-col gap-6">
        <CardSkeleton lines={7} />
      </div>
    </PageSkeleton>
  );
}

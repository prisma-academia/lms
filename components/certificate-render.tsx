import { type CertificateDesign, fillTemplate } from "@/lib/certificates/design";

/**
 * Renders a certificate from its design + award data. Pure component — used both
 * in the admin live-preview (client) and the learner's printable view (server).
 */
export function CertificateRender({
  design,
  data,
}: {
  design: CertificateDesign;
  data: Record<string, string>;
}) {
  return (
    <div
      className="mx-auto flex aspect-[1.414/1] w-full max-w-3xl flex-col items-center justify-center gap-4 rounded-[6px] border-[6px] bg-white px-10 py-8 text-center"
      style={{ borderColor: design.accentColor }}
    >
      <div
        className="text-2xl font-black uppercase tracking-wide sm:text-3xl"
        style={{ color: design.accentColor }}
      >
        {fillTemplate(design.title, data)}
      </div>
      <div className="text-sm text-stone-600">{fillTemplate(design.subtitle, data)}</div>
      <div className="font-heading text-3xl text-stone-900 sm:text-4xl">{data.clientName}</div>
      <div className="max-w-lg text-sm leading-relaxed text-stone-700">
        {fillTemplate(design.bodyText, data)}
      </div>
      <div
        className="mt-2 border-t-2 pt-2 text-xs font-semibold uppercase tracking-wide text-stone-500"
        style={{ borderColor: design.accentColor }}
      >
        {fillTemplate(design.footerText, data)}
      </div>
    </div>
  );
}

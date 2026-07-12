import { Icon } from "@/components/icon";
import { SectionLabel } from "./section-label";

type Props = {
  companyEmail: string | null;
  companyPhone: string | null;
  website: string | null;
  addressLines: string[];
};

export function LandingAbout({
  companyEmail,
  companyPhone,
  website,
  addressLines,
}: Props) {
  const hasContact =
    companyEmail || companyPhone || website || addressLines.length > 0;
  if (!hasContact) return null;

  const websiteHref = website?.trim()
    ? website.trim().startsWith("http")
      ? website.trim()
      : `https://${website.trim()}`
    : null;

  return (
    <section id="about" className="scroll-mt-24 border-t-2 border-ink bg-card">
      <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="text-center">
          <SectionLabel>About us</SectionLabel>
          <h2 className="mt-4 font-heading text-3xl">Get in touch</h2>
          <p className="mx-auto mt-2 max-w-xl font-medium text-ink/70">
            Questions about enrollment or your account? Reach out — we&apos;re
            here to help.
          </p>
        </div>

        <div className="mx-auto mt-8 grid max-w-2xl gap-3 sm:grid-cols-2">
          {companyEmail ? (
            <a
              href={`mailto:${companyEmail}`}
              className="flex items-start gap-3 rounded-[14px] border-2 border-ink bg-paper p-4 shadow-brutal-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-blue text-ink">
                <Icon name="mail" className="size-5" />
              </span>
              <div className="min-w-0 text-left">
                <p className="text-[12px] font-bold text-ink/50">Email</p>
                <p className="truncate text-sm font-bold">{companyEmail}</p>
              </div>
            </a>
          ) : null}

          {companyPhone ? (
            <a
              href={`tel:${companyPhone.replace(/\s/g, "")}`}
              className="flex items-start gap-3 rounded-[14px] border-2 border-ink bg-paper p-4 shadow-brutal-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-green text-ink">
                <Icon name="phone" className="size-5" />
              </span>
              <div className="min-w-0 text-left">
                <p className="text-[12px] font-bold text-ink/50">Phone</p>
                <p className="text-sm font-bold">{companyPhone}</p>
              </div>
            </a>
          ) : null}

          {websiteHref ? (
            <a
              href={websiteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-[14px] border-2 border-ink bg-paper p-4 shadow-brutal-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-purple text-ink">
                <Icon name="globe" className="size-5" />
              </span>
              <div className="min-w-0 text-left">
                <p className="text-[12px] font-bold text-ink/50">Website</p>
                <p className="truncate text-sm font-bold">{website}</p>
              </div>
            </a>
          ) : null}

          {addressLines.length > 0 ? (
            <div className="flex items-start gap-3 rounded-[14px] border-2 border-ink bg-paper p-4 shadow-brutal-sm sm:col-span-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-yellow text-ink">
                <Icon name="map-pin" className="size-5" />
              </span>
              <div className="text-left">
                <p className="text-[12px] font-bold text-ink/50">Address</p>
                {addressLines.map((line) => (
                  <p key={line} className="text-sm font-bold">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

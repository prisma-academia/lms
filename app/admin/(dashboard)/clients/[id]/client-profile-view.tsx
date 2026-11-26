import type { ReactNode } from "react";
import { Card } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icon";
import {
  LANGUAGE_PROFICIENCY_LABELS,
  PROFILE_LINKS,
  PROFILE_LINK_LABELS,
  SKILL_LEVEL_LABELS,
  formatDay,
  formatMonth,
  formatMonthRange,
  formatYearRange,
  type ClientProfile,
} from "@/lib/schemas/client-profile";

/**
 * A learner's profile, as staff read it.
 *
 * Read-only, and only what the learner has filled in: a section with nothing in
 * it is left out rather than shown empty. Everything here was typed by the
 * learner, so it is rendered as text and never as markup, and their documents
 * open through a route that checks the viewer's permission each time.
 */

export type StaffIssuedCertificate = {
  id: string;
  name: string;
  earnedOn: string | null;
  serial: string;
  issuedLabel: string;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-dashed border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="font-heading text-base leading-tight">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

const LINK_CLASS =
  "inline-flex items-center gap-1 font-bold underline decoration-2 underline-offset-4 outline-none focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring";

function shortUrl(url: string): string {
  return url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function ClientProfileView({
  clientId,
  profile,
  avatarSrc,
  issued,
}: {
  clientId: string;
  profile: ClientProfile;
  /** The staff-side address of the learner's photo, or null. */
  avatarSrc: string | null;
  issued: StaffIssuedCertificate[];
}) {
  const links = PROFILE_LINKS.filter((key) => profile.links[key]);
  const about = profile.headline || profile.bio || profile.location || profile.dateOfBirth || links.length > 0;
  const hasAnything =
    about ||
    avatarSrc ||
    profile.experience.length > 0 ||
    profile.education.length > 0 ||
    profile.certifications.length > 0 ||
    issued.length > 0 ||
    profile.skills.length > 0 ||
    profile.languages.length > 0;

  if (!hasAnything) {
    return (
      <Card>
        <h2 className="font-heading text-lg leading-tight">Profile</h2>
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          This learner hasn&rsquo;t added anything to their profile yet. Experience, education,
          certifications, skills and languages appear here once they do.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="font-heading text-lg leading-tight">Profile</h2>
      <p className="mt-1 text-sm font-medium text-muted-foreground">
        Written by the learner. Only they can change it.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        {about || avatarSrc ? (
          <Section title="About">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {avatarSrc ? (
                // A signed, short-lived address: not one the image optimiser can fetch.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
                  alt=""
                  width={80}
                  height={80}
                  className="size-20 shrink-0 rounded-full border-2 border-foreground bg-muted object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                {profile.headline ? <p className="text-[15px] font-bold">{profile.headline}</p> : null}
                {profile.bio ? (
                  <p className="mt-1.5 max-w-prose whitespace-pre-line text-sm font-medium leading-relaxed">
                    {profile.bio}
                  </p>
                ) : null}
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                  {profile.location ? (
                    <div className="flex items-center gap-1.5">
                      <dt className="sr-only">Location</dt>
                      <Icon name="map-pin" className="size-4 text-muted-foreground" aria-hidden />
                      <dd className="font-medium">{profile.location}</dd>
                    </div>
                  ) : null}
                  {profile.dateOfBirth ? (
                    <div className="flex items-center gap-1.5">
                      <dt className="font-medium text-muted-foreground">Born</dt>
                      <dd className="num font-medium">{formatDay(profile.dateOfBirth)}</dd>
                    </div>
                  ) : null}
                </dl>
                {links.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1 text-sm">
                    {links.map((key) => (
                      <li key={key} className="flex min-w-0 flex-wrap gap-x-2">
                        <span className="font-medium text-muted-foreground">{PROFILE_LINK_LABELS[key]}</span>
                        {/* The address is shown in full, not hidden behind a label:
                            staff should see where a learner's link goes before following it. */}
                        <a
                          href={profile.links[key] as string}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className={`${LINK_CLASS} min-w-0 break-all`}
                        >
                          {shortUrl(profile.links[key] as string)}
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </Section>
        ) : null}

        {profile.experience.length > 0 ? (
          <Section title="Experience">
            <ul className="flex flex-col gap-3.5">
              {profile.experience.map((entry) => (
                <li key={entry.id}>
                  <p className="text-sm font-bold">
                    {entry.title}
                    <span className="font-medium">, {entry.organisation}</span>
                    {entry.location ? <span className="font-medium text-muted-foreground">, {entry.location}</span> : null}
                  </p>
                  <p className="num mt-0.5 flex flex-wrap items-center gap-2 text-[13px] font-bold text-muted-foreground">
                    {formatMonthRange(entry.start, entry.end, entry.current)}
                    {entry.current ? <Badge color="var(--success)">Current</Badge> : null}
                  </p>
                  {entry.description ? (
                    <p className="mt-1.5 max-w-prose whitespace-pre-line text-sm font-medium leading-relaxed">
                      {entry.description}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {profile.education.length > 0 ? (
          <Section title="Education">
            <ul className="flex flex-col gap-3.5">
              {profile.education.map((entry) => {
                const award = [entry.qualification, entry.field].filter(Boolean).join(", ");
                const years = formatYearRange(entry.startYear, entry.endYear);
                return (
                  <li key={entry.id}>
                    <p className="text-sm font-bold">{entry.school}</p>
                    {award ? <p className="text-sm font-medium">{award}</p> : null}
                    {years ? <p className="num mt-0.5 text-[13px] font-bold text-muted-foreground">{years}</p> : null}
                    {entry.description ? (
                      <p className="mt-1.5 max-w-prose whitespace-pre-line text-sm font-medium leading-relaxed">
                        {entry.description}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {issued.length > 0 || profile.certifications.length > 0 ? (
          <Section title="Certifications">
            <ul className="flex flex-col gap-3.5">
              {issued.map((certificate) => (
                <li key={certificate.id}>
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
                    {certificate.name}
                    <Badge color="var(--primary)">Issued here</Badge>
                  </p>
                  {certificate.earnedOn ? <p className="text-sm font-medium">{certificate.earnedOn}</p> : null}
                  <p className="num mt-0.5 text-[13px] font-bold text-muted-foreground">
                    Issued {certificate.issuedLabel}, no. {certificate.serial}
                  </p>
                </li>
              ))}
              {profile.certifications.map((entry) => {
                const dates =
                  entry.issued && entry.expires
                    ? `Issued ${formatMonth(entry.issued)}, expires ${formatMonth(entry.expires)}`
                    : entry.issued
                      ? `Issued ${formatMonth(entry.issued)}`
                      : entry.expires
                        ? `Expires ${formatMonth(entry.expires)}`
                        : "";
                return (
                  <li key={entry.id}>
                    <p className="text-sm font-bold">{entry.name}</p>
                    <p className="text-sm font-medium">{entry.issuer}</p>
                    {dates ? <p className="num mt-0.5 text-[13px] font-bold text-muted-foreground">{dates}</p> : null}
                    {entry.credentialId ? (
                      <p className="mt-0.5 break-all text-[13px] font-medium text-muted-foreground">
                        Credential ID {entry.credentialId}
                      </p>
                    ) : null}
                    {entry.credentialUrl || entry.proofKey ? (
                      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                        {entry.credentialUrl ? (
                          <a
                            href={entry.credentialUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className={`${LINK_CLASS} min-w-0 break-all`}
                          >
                            <Icon name="external-link" className="size-3.5 shrink-0" aria-hidden />
                            {shortUrl(entry.credentialUrl)}
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        ) : null}
                        {entry.proofKey ? (
                          <a
                            href={`/api/tenant/clients/${clientId}/profile-files?certification=${entry.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={LINK_CLASS}
                          >
                            <Icon name="file" className="size-3.5 shrink-0" aria-hidden />
                            Open proof document
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        ) : null}
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] font-medium text-muted-foreground">
                        No proof or verification link provided.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {profile.skills.length > 0 ? (
          <Section title="Skills">
            <ul className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <li
                  key={skill.id}
                  className="inline-flex max-w-full items-baseline gap-1.5 rounded-[8px] border-2 border-border bg-background px-2.5 py-1 text-sm"
                >
                  <span className="break-words font-bold">{skill.name}</span>
                  {skill.level ? (
                    <span className="text-xs font-medium text-muted-foreground">{SKILL_LEVEL_LABELS[skill.level]}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {profile.languages.length > 0 ? (
          <Section title="Languages">
            <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {profile.languages.map((language) => (
                <li key={language.id}>
                  <span className="font-bold">{language.name}</span>
                  <span className="font-medium text-muted-foreground">
                    , {LANGUAGE_PROFICIENCY_LABELS[language.proficiency].toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </Card>
  );
}

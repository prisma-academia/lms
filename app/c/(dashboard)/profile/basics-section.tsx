"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import {
  PROFILE_LIMITS,
  PROFILE_LINKS,
  PROFILE_LINK_LABELS,
  basicsSchema,
  fieldErrors,
  formatDay,
  type ProfileLinkKey,
} from "@/lib/schemas/client-profile";
import {
  FormActions,
  FormPanel,
  SectionCard,
  TextAreaField,
  TextField,
  isOpen,
  orEmpty,
  useDraft,
  useProfileEditor,
} from "./profile-ui";

const LINK_PLACEHOLDERS: Record<ProfileLinkKey, string> = {
  website: "https://your-site.com",
  linkedin: "linkedin.com/in/your-name",
  github: "github.com/your-name",
  x: "x.com/your-name",
};

/** A link shown without its scheme: the host and path are what people recognise. */
function shortUrl(url: string): string {
  return url.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "");
}

function BasicsForm() {
  const { profile, account, save } = useProfileEditor();
  const { values, set, dirty } = useDraft({
    displayName: profile.displayName,
    firstName: orEmpty(account.firstName),
    lastName: orEmpty(account.lastName),
    headline: orEmpty(profile.headline),
    bio: orEmpty(profile.bio),
    location: orEmpty(profile.location),
    phone: orEmpty(account.phone),
    dateOfBirth: orEmpty(profile.dateOfBirth),
    website: orEmpty(profile.links.website),
    linkedin: orEmpty(profile.links.linkedin),
    github: orEmpty(profile.links.github),
    x: orEmpty(profile.links.x),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Today, as the browser sees it — only ever read after the form has mounted.
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  async function submit() {
    const { website, linkedin, github, x, ...rest } = values;
    const value = { ...rest, links: { website, linkedin, github, x } };
    const parsed = basicsSchema.safeParse(value);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFormError("Some details need another look. They are marked above.");
      return;
    }
    setErrors({});
    setFormError(null);
    const result = await save({ section: "basics", value }, "Details saved.");
    if (!result.ok) setFormError(result.message);
  }

  return (
    <FormPanel title="Edit your details" onSubmit={submit}>
      <TextField
        label="Display name"
        hint="What we call you across the academy."
        value={values.displayName}
        onChange={(v) => set("displayName", v)}
        error={errors.displayName}
        max={PROFILE_LIMITS.displayName}
        autoComplete="name"
        autoFocus
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="First name"
          optional
          value={values.firstName}
          onChange={(v) => set("firstName", v)}
          error={errors.firstName}
          max={PROFILE_LIMITS.personName}
          autoComplete="given-name"
        />
        <TextField
          label="Last name"
          optional
          value={values.lastName}
          onChange={(v) => set("lastName", v)}
          error={errors.lastName}
          max={PROFILE_LIMITS.personName}
          autoComplete="family-name"
        />
      </div>
      <TextField
        label="Headline"
        optional
        hint="One line on what you do, such as “Data analyst at Kuda”."
        value={values.headline}
        onChange={(v) => set("headline", v)}
        error={errors.headline}
        max={PROFILE_LIMITS.headline}
      />
      <TextAreaField
        label="Bio"
        optional
        hint="A few sentences about your background and what you are working towards."
        value={values.bio}
        onChange={(v) => set("bio", v)}
        error={errors.bio}
        max={PROFILE_LIMITS.bio}
        rows={5}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Location"
          optional
          placeholder="City, country"
          value={values.location}
          onChange={(v) => set("location", v)}
          error={errors.location}
          max={PROFILE_LIMITS.location}
          autoComplete="address-level2"
        />
        <TextField
          label="Phone"
          optional
          type="tel"
          inputMode="tel"
          placeholder="+234 801 234 5678"
          value={values.phone}
          onChange={(v) => set("phone", v)}
          error={errors.phone}
          max={PROFILE_LIMITS.phone}
          autoComplete="tel"
        />
      </div>
      <TextField
        label="Date of birth"
        optional
        type="date"
        hint="Only you and the academy's staff can see this."
        value={values.dateOfBirth}
        onChange={(v) => set("dateOfBirth", v)}
        error={errors.dateOfBirth}
        maxDate={today}
        autoComplete="bday"
        className="sm:max-w-[16rem]"
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 text-[13px] font-bold text-foreground">
          Links <span className="font-medium text-muted-foreground">(optional, https only)</span>
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {PROFILE_LINKS.map((key) => (
            <TextField
              key={key}
              label={PROFILE_LINK_LABELS[key]}
              type="url"
              inputMode="url"
              placeholder={LINK_PLACEHOLDERS[key]}
              value={values[key]}
              onChange={(v) => set(key, v)}
              error={errors[`links.${key}`]}
              max={PROFILE_LIMITS.url}
              autoComplete={key === "website" ? "url" : "off"}
            />
          ))}
        </div>
      </fieldset>

      <FormActions dirty={dirty} error={formError} saveLabel="Save details" />
    </FormPanel>
  );
}

export function BasicsSection() {
  const { profile, account, open, requestOpen } = useProfileEditor();
  const editing = isOpen(open, "basics");
  const links = PROFILE_LINKS.filter((key) => profile.links[key]);
  const legalName = [account.firstName, account.lastName].filter(Boolean).join(" ");

  // Only rows with something in them: a column of dashes teaches nobody anything.
  const rows: { label: string; value: string; icon: "mail" | "phone" | "map-pin" | "calendar" | "user" }[] = [
    { label: "Email", value: account.email, icon: "mail" as const },
    ...(legalName && legalName !== profile.displayName ? [{ label: "Full name", value: legalName, icon: "user" as const }] : []),
    ...(account.phone ? [{ label: "Phone", value: account.phone, icon: "phone" as const }] : []),
    ...(profile.location ? [{ label: "Location", value: profile.location, icon: "map-pin" as const }] : []),
    ...(profile.dateOfBirth ? [{ label: "Date of birth", value: formatDay(profile.dateOfBirth), icon: "calendar" as const }] : []),
  ];

  return (
    <SectionCard
      section="basics"
      title="About you"
      action={
        editing ? null : (
          <Button type="button" size="sm" variant="outline" onClick={() => requestOpen({ section: "basics" })}>
            Edit
          </Button>
        )
      }
    >
      {editing ? (
        <BasicsForm />
      ) : (
        <div className="flex flex-col gap-4">
          {profile.bio ? (
            <p className="max-w-prose whitespace-pre-line text-[15px] font-medium leading-relaxed text-foreground">
              {profile.bio}
            </p>
          ) : (
            <p className="max-w-prose text-sm font-medium text-muted-foreground">
              No bio yet. A few sentences about your background help your instructors pitch
              feedback at the right level.
            </p>
          )}

          <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.label} className="flex min-w-0 items-start gap-2.5">
                <Icon name={row.icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-xs font-bold text-muted-foreground">{row.label}</dt>
                  <dd className="break-words text-sm font-medium text-foreground">{row.value}</dd>
                </div>
              </div>
            ))}
          </dl>

          {links.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Links">
              {links.map((key) => (
                <li key={key} className="min-w-0 max-w-full">
                  <a
                    href={profile.links[key] as string}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="group/link inline-flex max-w-full items-center gap-1.5 rounded-[8px] border-2 border-border bg-background px-2.5 py-1 text-[13px] font-bold text-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Icon name={key === "website" ? "globe" : "link"} className="size-3.5 shrink-0" aria-hidden />
                    <span className="shrink-0">{PROFILE_LINK_LABELS[key]}</span>
                    {/* Follows the pill on hover: muted text on the accent fill is too faint. */}
                    <span className="truncate font-medium text-muted-foreground group-hover/link:text-accent-foreground">
                      {shortUrl(profile.links[key] as string)}
                    </span>
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

import { z } from "zod";

/**
 * A learner's profile: who they are beyond a name and an email.
 *
 * It lives in one JSON column (`Client.profileJson`), which predates all of
 * this — older rows hold `{ name }`, sometimes with stray keys such as `state`.
 * Three rules follow from that, and everything below is built on them:
 *
 *  1. Reading never throws. `parseClientProfile` turns ANY stored value into a
 *     well-formed profile, dropping what it cannot understand one field or one
 *     entry at a time. A profile page that 500s because of a row written three
 *     releases ago is the failure this exists to prevent.
 *
 *  2. Writing replaces one section. `applySectionPatch` sets only the keys that
 *     belong to the section being saved and leaves every other key — known or
 *     not — exactly as it was. Keys this module does not know are preserved on
 *     write and simply ignored on read.
 *
 *  3. It is all plain text. Nothing here is ever stored or rendered as HTML, so
 *     markup is stripped on the way in (`cleanText`) and links are limited to
 *     `https:`. The fields are shown to staff, and a profile is the one place a
 *     learner controls what staff see.
 *
 * Pure: no database, no storage, no app imports — the route, the page, the
 * staff view and the verification script all share it.
 */

/* -------------------------------------------------------------------------- */
/* Limits                                                                      */
/* -------------------------------------------------------------------------- */

export const PROFILE_LIMITS = {
  displayName: 200,
  personName: 100,
  phone: 40,
  headline: 120,
  bio: 1500,
  location: 120,
  url: 300,
  title: 120,
  organisation: 120,
  description: 1000,
  school: 160,
  qualification: 120,
  field: 120,
  certificationName: 160,
  issuer: 120,
  credentialId: 80,
  skillName: 40,
  languageName: 40,
  /** How many entries each list may hold. */
  experience: 20,
  education: 10,
  certifications: 30,
  skills: 40,
  languages: 12,
} as const;

/** Nothing a person types into one of these fields is legitimately longer. */
const RAW_INPUT_CAP = 20_000;

/* -------------------------------------------------------------------------- */
/* Text                                                                        */
/* -------------------------------------------------------------------------- */

// Control characters (tab and newline are handled separately), the zero-width
// space, the byte-order mark, and the bidirectional overrides and isolates —
// the last group can make "evil.example/gpj.exe" read as "evil.example/exe.jpg".
// Zero-width joiners are kept: several scripts and most emoji need them.
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F​‪-‮⁦-⁩﻿]/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HTML_TAG = /<\/?[a-zA-Z][^<>]*>/g;
/** A "<" that opens a tag which never closes: `<script src=x`. */
const DANGLING_TAG_OPEN = /<(?=[a-zA-Z/!?])/g;

/**
 * Reduce a typed value to plain text.
 *
 * Tags are removed until none are left — one pass is not enough, because
 * `<scr<script>ipt>` becomes `<script>` after it. What survives is text that is
 * safe to hand to anything: `a < b` and `<3` are untouched, markup is gone.
 */
export function cleanText(input: string, multiline = false): string {
  let text = input.normalize("NFC").replace(/\r\n?/g, "\n").replace(INVISIBLE, "");

  let previous: string;
  do {
    previous = text;
    text = text.replace(HTML_COMMENT, "").replace(HTML_TAG, "");
  } while (text !== previous);
  text = text.replace(DANGLING_TAG_OPEN, "");

  if (multiline) {
    return text
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return text.replace(/\s+/g, " ").trim();
}

function text(max: number, options: { multiline?: boolean } = {}) {
  return z
    .string()
    .max(RAW_INPUT_CAP, "That is too long.")
    .transform((value) => cleanText(value, options.multiline))
    .pipe(z.string().max(max, `Keep this to ${max} characters or fewer.`));
}

function requiredText(max: number, missing: string) {
  return text(max).pipe(z.string().min(1, missing));
}

/**
 * Empty, missing and null all mean "not given".
 *
 * `.nullish()` before the transform, here and in every optional field below:
 * that is what lets the key be left out of an object altogether. A union with
 * `z.undefined()` accepts the value but still demands the key.
 */
function optionalText(max: number, options: { multiline?: boolean } = {}) {
  return text(max, options)
    .nullish()
    .transform((value) => (value ? value : null));
}

/* -------------------------------------------------------------------------- */
/* Links                                                                       */
/* -------------------------------------------------------------------------- */

export const PROFILE_LINKS = ["website", "linkedin", "github", "x"] as const;
export type ProfileLinkKey = (typeof PROFILE_LINKS)[number];

export const PROFILE_LINK_LABELS: Record<ProfileLinkKey, string> = {
  website: "Website",
  linkedin: "LinkedIn",
  github: "GitHub",
  x: "X",
};

/**
 * Hosts a named link may point at. A link labelled "LinkedIn" in front of a
 * member of staff has to actually be LinkedIn; the website link is the one
 * place any https address is allowed, and it is labelled as such.
 */
const LINK_HOSTS: Record<ProfileLinkKey, readonly string[] | null> = {
  website: null,
  linkedin: ["linkedin.com"],
  github: ["github.com"],
  x: ["x.com", "twitter.com"],
};

/**
 * Normalise a typed address to an `https:` URL, or say why it cannot be one.
 *
 * `javascript:`, `data:`, `http:` and every other scheme are refused rather
 * than rewritten: silently turning `http://` into `https://` would publish a
 * link the learner never tested.
 */
export function normaliseHttpsUrl(
  input: string,
  allowedHosts: readonly string[] | null = null
): { ok: true; url: string } | { ok: false; reason: string } {
  const raw = cleanText(input);
  if (!raw) return { ok: false, reason: "Enter a link." };
  if (raw.length > PROFILE_LIMITS.url) return { ok: false, reason: "That link is too long." };
  if (/\s/.test(raw)) return { ok: false, reason: "A link can't contain spaces." };

  // "linkedin.com/in/ada" is what people type. A scheme is only assumed when
  // none was given; one that was given is never replaced.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  let url: URL;
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: "That doesn't look like a link." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Links must start with https://" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "A link can't include a username or password." };
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) {
    return { ok: false, reason: "That doesn't look like a link." };
  }
  if (allowedHosts && !allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return { ok: false, reason: `This must be a ${allowedHosts.join(" or ")} link.` };
  }

  const normalised = url.toString();
  if (normalised.length > PROFILE_LIMITS.url) return { ok: false, reason: "That link is too long." };
  return { ok: true, url: normalised };
}

function optionalUrl(allowedHosts: readonly string[] | null = null) {
  return z
    .string()
    .max(RAW_INPUT_CAP)
    .nullish()
    .transform((value, ctx) => {
      if (value == null || !cleanText(value)) return null;
      const result = normaliseHttpsUrl(value, allowedHosts);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.reason });
        return z.NEVER;
      }
      return result.url;
    });
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/** `YYYY-MM`, exactly what `<input type="month">` produces. */
const MONTH = /^(19[4-9]\d|20\d{2})-(0[1-9]|1[0-2])$/;
const MIN_YEAR = 1940;
const MAX_YEAR = 2099;

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Mar 2022". Built by hand rather than with `Intl` on purpose: this runs in
 * Client Components, and a formatted date must be the same string on the server
 * and in the browser whatever either machine's locale is.
 */
export function formatMonth(value: string | null | undefined): string {
  if (!value || !MONTH.test(value)) return "";
  const [year, month] = value.split("-");
  return `${MONTH_NAMES[Number(month) - 1]} ${year}`;
}

/** "Mar 2022 to Aug 2023", "Mar 2022 to present", "Mar 2022". */
export function formatMonthRange(start: string | null, end: string | null, current = false): string {
  const from = formatMonth(start);
  const to = current ? "present" : formatMonth(end);
  if (from && to) return `${from} to ${to}`;
  return from || to;
}

export function formatYearRange(start: number | null, end: number | null): string {
  if (start && end) return start === end ? String(start) : `${start} to ${end}`;
  return String(start ?? end ?? "");
}

const month = z.string().regex(MONTH, "Choose a month and year.");

function optionalMonth() {
  return z
    .string()
    .nullish()
    .transform((value, ctx) => {
      if (value == null || value.trim() === "") return null;
      if (!MONTH.test(value.trim())) {
        ctx.addIssue({ code: "custom", message: "Choose a month and year." });
        return z.NEVER;
      }
      return value.trim();
    });
}

function optionalYear() {
  return z
    .union([z.number(), z.string()])
    .nullish()
    .transform((value, ctx) => {
      if (value == null || value === "") return null;
      const year = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
        ctx.addIssue({ code: "custom", message: `Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.` });
        return z.NEVER;
      }
      return year;
    });
}

/**
 * The rule for a dated entry, in one place.
 *
 * `current` means "still going", which is the absence of an end date — so a
 * current entry with an end date is contradictory, and a finished one without
 * an end date is unfinished. Month strings compare correctly as text.
 */
export function dateRangeProblem(range: {
  start: string | null;
  end: string | null;
  current?: boolean;
}): string | null {
  if (range.current && range.end) return "A current role has no end date.";
  if (range.start && range.end && range.end < range.start) return "The end date can't be before the start date.";
  return null;
}

/** A real calendar date, from 1900 on and not in the future. */
export function birthDateProblem(value: string, now: Date = new Date()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "Enter a date as year, month and day.";
  const [year, monthNumber, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, monthNumber - 1, day));
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === monthNumber - 1 && date.getUTCDate() === day;
  if (!real) return "That date doesn't exist.";
  if (year < 1900) return "Enter a year from 1900 on.";
  // Compared as calendar days in UTC, with a day's grace for time zones ahead of it.
  if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return "A date of birth can't be in the future.";
  return null;
}

function optionalBirthDate() {
  return z
    .string()
    .nullish()
    .transform((value, ctx) => {
      if (value == null || value.trim() === "") return null;
      const problem = birthDateProblem(value.trim());
      if (problem) {
        ctx.addIssue({ code: "custom", message: problem });
        return z.NEVER;
      }
      return value.trim();
    });
}

/* -------------------------------------------------------------------------- */
/* Entries                                                                     */
/* -------------------------------------------------------------------------- */

const ENTRY_ID = /^[a-z0-9]{6,32}$/;

/** A fresh id for a list entry. Random, short, and meaningless on purpose. */
export function newEntryId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Missing or malformed ids are replaced rather than rejected: an id is plumbing. */
const entryId = z
  .string()
  .nullish()
  .transform((value) => (typeof value === "string" && ENTRY_ID.test(value) ? value : newEntryId()));

export const experienceEntrySchema = z
  .object({
    id: entryId,
    title: requiredText(PROFILE_LIMITS.title, "Enter your job title."),
    organisation: requiredText(PROFILE_LIMITS.organisation, "Enter the organisation."),
    location: optionalText(PROFILE_LIMITS.location),
    start: month,
    end: optionalMonth(),
    current: z.boolean().optional().default(false),
    description: optionalText(PROFILE_LIMITS.description, { multiline: true }),
  })
  .superRefine((entry, ctx) => {
    const problem = dateRangeProblem(entry);
    if (problem) ctx.addIssue({ code: "custom", path: ["end"], message: problem });
    if (!entry.current && !entry.end) {
      ctx.addIssue({
        code: "custom",
        path: ["end"],
        message: "Add an end date, or mark this as your current role.",
      });
    }
  });

export const educationEntrySchema = z
  .object({
    id: entryId,
    school: requiredText(PROFILE_LIMITS.school, "Enter the school or institution."),
    qualification: optionalText(PROFILE_LIMITS.qualification),
    field: optionalText(PROFILE_LIMITS.field),
    startYear: optionalYear(),
    endYear: optionalYear(),
    description: optionalText(PROFILE_LIMITS.description, { multiline: true }),
  })
  .superRefine((entry, ctx) => {
    if (entry.startYear && entry.endYear && entry.endYear < entry.startYear) {
      ctx.addIssue({ code: "custom", path: ["endYear"], message: "The end year can't be before the start year." });
    }
  });

/**
 * Storage keys this profile may hold. The shape is checked here; whether a key
 * belongs to THIS learner is checked with `foreignProfileKeys`, which needs to
 * know who is asking.
 */
const AVATAR_KEY = /^tenants\/[a-z0-9]+\/clients\/[a-z0-9]+\/avatar-[a-f0-9]{16}\.(png|jpg|webp)$/;
const DOCUMENT_KEY = /^tenants\/[a-z0-9]+\/clients\/[a-z0-9]+\/documents\/[a-f0-9]{16}\.(png|jpg|webp|pdf)$/;

function optionalKey(pattern: RegExp) {
  return z
    .string()
    .max(RAW_INPUT_CAP)
    .nullish()
    .transform((value, ctx) => {
      if (value == null || value === "") return null;
      if (!pattern.test(value)) {
        ctx.addIssue({ code: "custom", message: "That file can't be used here." });
        return z.NEVER;
      }
      return value;
    });
}

export const certificationEntrySchema = z
  .object({
    id: entryId,
    name: requiredText(PROFILE_LIMITS.certificationName, "Enter the name of the certification."),
    issuer: requiredText(PROFILE_LIMITS.issuer, "Enter who issued it."),
    issued: optionalMonth(),
    expires: optionalMonth(),
    credentialId: optionalText(PROFILE_LIMITS.credentialId),
    credentialUrl: optionalUrl(),
    proofKey: optionalKey(DOCUMENT_KEY),
  })
  .superRefine((entry, ctx) => {
    if (entry.issued && entry.expires && entry.expires < entry.issued) {
      ctx.addIssue({ code: "custom", path: ["expires"], message: "The expiry date can't be before the issue date." });
    }
  });

export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

export const skillEntrySchema = z.object({
  id: entryId,
  name: requiredText(PROFILE_LIMITS.skillName, "Enter a skill."),
  level: z
    .union([z.enum(SKILL_LEVELS), z.literal("")])
    .nullish()
    .transform((value) => (value ? value : null)),
});

export const LANGUAGE_PROFICIENCIES = ["basic", "conversational", "fluent", "native"] as const;
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number];
export const LANGUAGE_PROFICIENCY_LABELS: Record<LanguageProficiency, string> = {
  basic: "Basic",
  conversational: "Conversational",
  fluent: "Fluent",
  native: "Native or first language",
};

export const languageEntrySchema = z.object({
  id: entryId,
  name: requiredText(PROFILE_LIMITS.languageName, "Enter a language."),
  proficiency: z.enum(LANGUAGE_PROFICIENCIES, { message: "Choose how well you speak it." }),
});

export type ExperienceEntry = z.output<typeof experienceEntrySchema>;
export type EducationEntry = z.output<typeof educationEntrySchema>;
export type CertificationEntry = z.output<typeof certificationEntrySchema>;
export type SkillEntry = z.output<typeof skillEntrySchema>;
export type LanguageEntry = z.output<typeof languageEntrySchema>;

/* -------------------------------------------------------------------------- */
/* Lists                                                                       */
/* -------------------------------------------------------------------------- */

/** No two entries may share an id: an id is how one is found again to edit it. */
function uniqueIds<T extends { id: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.map((entry) => {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      return entry;
    }
    const id = newEntryId();
    seen.add(id);
    return { ...entry, id };
  });
}

/** The same skill or language twice is a typo, not information. */
function uniqueNames<T extends { name: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Current roles first, then most recently started. */
export function sortExperience(entries: ExperienceEntry[]): ExperienceEntry[] {
  return [...entries].sort(
    (a, b) => Number(b.current) - Number(a.current) || (a.start < b.start ? 1 : a.start > b.start ? -1 : 0)
  );
}

export function sortEducation(entries: EducationEntry[]): EducationEntry[] {
  const latest = (entry: EducationEntry) => entry.endYear ?? entry.startYear ?? 0;
  return [...entries].sort((a, b) => latest(b) - latest(a));
}

export function sortCertifications(entries: CertificationEntry[]): CertificationEntry[] {
  return [...entries].sort((a, b) => ((a.issued ?? "") < (b.issued ?? "") ? 1 : (a.issued ?? "") > (b.issued ?? "") ? -1 : 0));
}

function list<Entry extends { id: string }>(
  schema: z.ZodType<Entry>,
  max: number,
  noun: string,
  arrange: (entries: Entry[]) => Entry[]
) {
  return z
    .array(schema)
    .max(max, `You can list up to ${max} ${noun}.`)
    .transform((entries) => arrange(uniqueIds(entries)));
}

const experienceList = list(experienceEntrySchema, PROFILE_LIMITS.experience, "roles", sortExperience);
const educationList = list(educationEntrySchema, PROFILE_LIMITS.education, "schools", sortEducation);
const certificationList = list(
  certificationEntrySchema,
  PROFILE_LIMITS.certifications,
  "certifications",
  sortCertifications
);
const skillList = list(skillEntrySchema, PROFILE_LIMITS.skills, "skills", uniqueNames);
const languageList = list(languageEntrySchema, PROFILE_LIMITS.languages, "languages", uniqueNames);

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

const linksSchema = z
  .object({
    website: optionalUrl(LINK_HOSTS.website),
    linkedin: optionalUrl(LINK_HOSTS.linkedin),
    github: optionalUrl(LINK_HOSTS.github),
    x: optionalUrl(LINK_HOSTS.x),
  })
  .partial()
  .transform((links) => ({
    website: links.website ?? null,
    linkedin: links.linkedin ?? null,
    github: links.github ?? null,
    x: links.x ?? null,
  }));

const phone = z
  .string()
  .max(RAW_INPUT_CAP)
  .nullish()
  .transform((value, ctx) => {
    const cleaned = value ? cleanText(value) : "";
    if (!cleaned) return null;
    if (cleaned.length > PROFILE_LIMITS.phone || !/^\+?[\d\s().-]{6,}$/.test(cleaned)) {
      ctx.addIssue({ code: "custom", message: "Enter a phone number, such as +234 801 234 5678." });
      return z.NEVER;
    }
    return cleaned;
  });

/**
 * "Basics" is the one section that is not a single key: the name and phone
 * number live in their own columns, and the rest are several small keys.
 */
export const basicsSchema = z.object({
  displayName: requiredText(PROFILE_LIMITS.displayName, "Enter the name you'd like to be called."),
  firstName: optionalText(PROFILE_LIMITS.personName),
  lastName: optionalText(PROFILE_LIMITS.personName),
  phone,
  headline: optionalText(PROFILE_LIMITS.headline),
  bio: optionalText(PROFILE_LIMITS.bio, { multiline: true }),
  location: optionalText(PROFILE_LIMITS.location),
  dateOfBirth: optionalBirthDate(),
  links: linksSchema.optional().default({ website: null, linkedin: null, github: null, x: null }),
});

export type ProfileBasics = z.output<typeof basicsSchema>;
export type ProfileLinks = ProfileBasics["links"];

export const PROFILE_SECTIONS = [
  "basics",
  "avatar",
  "experience",
  "education",
  "certifications",
  "skills",
  "languages",
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export const PROFILE_SECTION_LABELS: Record<ProfileSection, string> = {
  basics: "About you",
  avatar: "Photo",
  experience: "Experience",
  education: "Education",
  certifications: "Certifications",
  skills: "Skills",
  languages: "Languages",
};

/** One save: a section, and the whole new value of that section. */
export const profilePatchSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("basics"), value: basicsSchema }),
  z.object({ section: z.literal("avatar"), value: z.object({ key: optionalKey(AVATAR_KEY) }) }),
  z.object({ section: z.literal("experience"), value: experienceList }),
  z.object({ section: z.literal("education"), value: educationList }),
  z.object({ section: z.literal("certifications"), value: certificationList }),
  z.object({ section: z.literal("skills"), value: skillList }),
  z.object({ section: z.literal("languages"), value: languageList }),
]);

export type ProfilePatch = z.output<typeof profilePatchSchema>;

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

export type ClientProfile = {
  displayName: string;
  headline: string | null;
  bio: string | null;
  location: string | null;
  dateOfBirth: string | null;
  links: ProfileLinks;
  avatarKey: string | null;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  skills: SkillEntry[];
  languages: LanguageEntry[];
};

export const EMPTY_PROFILE: ClientProfile = {
  displayName: "",
  headline: null,
  bio: null,
  location: null,
  dateOfBirth: null,
  links: { website: null, linkedin: null, github: null, x: null },
  avatarKey: null,
  experience: [],
  education: [],
  certifications: [],
  skills: [],
  languages: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, max: number, multiline = false): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanText(value.slice(0, RAW_INPUT_CAP), multiline).slice(0, max).trim();
  return cleaned || null;
}

function readUrl(value: unknown, hosts: readonly string[] | null): string | null {
  if (typeof value !== "string") return null;
  const result = normaliseHttpsUrl(value.slice(0, RAW_INPUT_CAP), hosts);
  return result.ok ? result.url : null;
}

/** Keep the entries that are valid; one bad entry never costs the others. */
function readList<Entry>(value: unknown, schema: z.ZodType<Entry>, max: number): Entry[] {
  if (!Array.isArray(value)) return [];
  const entries: Entry[] = [];
  // Look a little past the cap so a few invalid entries do not eat into it.
  for (const item of value.slice(0, max * 2)) {
    const parsed = schema.safeParse(item);
    if (parsed.success) entries.push(parsed.data);
    if (entries.length === max) break;
  }
  return entries;
}

/**
 * Turn whatever is stored into a profile. Never throws, whatever it is given.
 *
 * Unknown keys are ignored here and kept on write (see `applySectionPatch`).
 * A profile written before this module existed has only `name`; one from the
 * demo seed also has `state`, which is read as the location until the learner
 * sets one.
 */
export function parseClientProfile(stored: unknown): ClientProfile {
  try {
    if (!isRecord(stored)) return { ...EMPTY_PROFILE, links: { ...EMPTY_PROFILE.links } };
    const links = isRecord(stored.links) ? stored.links : {};
    const birthDate = typeof stored.dateOfBirth === "string" ? stored.dateOfBirth.trim() : "";
    const avatarKey = typeof stored.avatarKey === "string" && AVATAR_KEY.test(stored.avatarKey) ? stored.avatarKey : null;

    return {
      displayName: readText(stored.name, PROFILE_LIMITS.displayName) ?? "",
      headline: readText(stored.headline, PROFILE_LIMITS.headline),
      bio: readText(stored.bio, PROFILE_LIMITS.bio, true),
      location:
        readText(stored.location, PROFILE_LIMITS.location) ?? readText(stored.state, PROFILE_LIMITS.location),
      dateOfBirth: birthDate && !birthDateProblem(birthDate) ? birthDate : null,
      links: {
        website: readUrl(links.website, LINK_HOSTS.website),
        linkedin: readUrl(links.linkedin, LINK_HOSTS.linkedin),
        github: readUrl(links.github, LINK_HOSTS.github),
        x: readUrl(links.x, LINK_HOSTS.x),
      },
      avatarKey,
      experience: sortExperience(uniqueIds(readList(stored.experience, experienceEntrySchema, PROFILE_LIMITS.experience))),
      education: sortEducation(uniqueIds(readList(stored.education, educationEntrySchema, PROFILE_LIMITS.education))),
      certifications: sortCertifications(
        uniqueIds(readList(stored.certifications, certificationEntrySchema, PROFILE_LIMITS.certifications))
      ),
      skills: uniqueNames(uniqueIds(readList(stored.skills, skillEntrySchema, PROFILE_LIMITS.skills))),
      languages: uniqueNames(uniqueIds(readList(stored.languages, languageEntrySchema, PROFILE_LIMITS.languages))),
    };
  } catch {
    return { ...EMPTY_PROFILE, links: { ...EMPTY_PROFILE.links } };
  }
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The stored object after one section is saved.
 *
 * Only that section's keys are set. Every other key in `stored` — another
 * section, or something this module has never heard of — comes back untouched,
 * which is what lets two tabs save two different sections without one undoing
 * the other. (The route runs this inside a serializable transaction, so "the
 * stored object" is always the latest one.)
 */
export function applySectionPatch(stored: unknown, patch: ProfilePatch): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(stored) ? { ...stored } : {};
  switch (patch.section) {
    case "basics":
      next.name = patch.value.displayName;
      next.headline = patch.value.headline;
      next.bio = patch.value.bio;
      next.location = patch.value.location;
      next.dateOfBirth = patch.value.dateOfBirth;
      next.links = patch.value.links;
      // `state` was the old home of the location. Once the learner has saved
      // the section it has done its job; leaving it would bring a cleared
      // location straight back.
      delete next.state;
      break;
    case "avatar":
      next.avatarKey = patch.value.key;
      break;
    case "experience":
    case "education":
    case "certifications":
    case "skills":
    case "languages":
      next[patch.section] = patch.value;
      break;
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Uploaded files                                                              */
/* -------------------------------------------------------------------------- */

export type ProfileOwner = { tenantId: string; clientId: string };

/** Where this learner's profile uploads live. Nothing outside it is theirs to reference. */
export function profileKeyPrefix(owner: ProfileOwner): string {
  return `tenants/${owner.tenantId}/clients/${owner.clientId}/`;
}

export function isOwnAvatarKey(key: string, owner: ProfileOwner): boolean {
  return AVATAR_KEY.test(key) && key.startsWith(`${profileKeyPrefix(owner)}avatar-`);
}

export function isOwnDocumentKey(key: string, owner: ProfileOwner): boolean {
  return DOCUMENT_KEY.test(key) && key.startsWith(`${profileKeyPrefix(owner)}documents/`);
}

/** Every storage key a profile (or one stored object) points at. */
export function profileStorageKeys(profile: Pick<ClientProfile, "avatarKey" | "certifications">): string[] {
  const keys = profile.certifications.map((entry) => entry.proofKey).filter((key): key is string => !!key);
  if (profile.avatarKey) keys.push(profile.avatarKey);
  return keys;
}

/**
 * Keys in a patch that do not belong to the learner saving it.
 *
 * A key is only a string; without this check a learner could save somebody
 * else's key as their own photo or proof document and have the app hand them a
 * signed link to it. Anything returned here must fail the save.
 */
export function foreignProfileKeys(patch: ProfilePatch, owner: ProfileOwner): string[] {
  if (patch.section === "avatar") {
    return patch.value.key && !isOwnAvatarKey(patch.value.key, owner) ? [patch.value.key] : [];
  }
  if (patch.section === "certifications") {
    return patch.value
      .map((entry) => entry.proofKey)
      .filter((key): key is string => !!key && !isOwnDocumentKey(key, owner));
  }
  return [];
}

/* -------------------------------------------------------------------------- */
/* Completeness                                                                */
/* -------------------------------------------------------------------------- */

export type CompletenessItem = {
  key: "photo" | "headline" | "bio" | "location" | "experience" | "education" | "certifications" | "skills" | "languages";
  /** The section to open to complete it. */
  section: ProfileSection;
  /** What to do, as an instruction: "Add a photo". */
  prompt: string;
  weight: number;
  done: boolean;
};

export type ProfileCompleteness = {
  percent: number;
  items: CompletenessItem[];
  missing: CompletenessItem[];
};

/** Three skills is where a list starts to say something about a person. */
const SKILLS_FOR_COMPLETE = 3;

/**
 * How much of a profile is filled in, and what is left.
 *
 * Weighted by what a member of staff or an employer actually reads first.
 * `photoAvailable: false` leaves the photo out entirely (no object storage is
 * configured), so a learner is never held below 100% by something they cannot do.
 * A certificate earned on the platform counts for the certifications item: the
 * learner should not have to retype what the academy itself issued.
 */
export function profileCompleteness(
  profile: ClientProfile,
  options: { photoAvailable?: boolean; issuedCertificates?: number } = {}
): ProfileCompleteness {
  const photoAvailable = options.photoAvailable ?? true;
  const all: CompletenessItem[] = [
    { key: "photo", section: "avatar", prompt: "Add a photo", weight: 10, done: !!profile.avatarKey },
    { key: "headline", section: "basics", prompt: "Write a headline", weight: 10, done: !!profile.headline },
    { key: "bio", section: "basics", prompt: "Write a short bio", weight: 15, done: !!profile.bio },
    { key: "location", section: "basics", prompt: "Add your location", weight: 5, done: !!profile.location },
    { key: "experience", section: "experience", prompt: "Add your experience", weight: 20, done: profile.experience.length > 0 },
    { key: "education", section: "education", prompt: "Add your education", weight: 15, done: profile.education.length > 0 },
    {
      key: "certifications",
      section: "certifications",
      prompt: "Add a certification",
      weight: 10,
      done: profile.certifications.length > 0 || (options.issuedCertificates ?? 0) > 0,
    },
    {
      key: "skills",
      section: "skills",
      prompt: `List at least ${SKILLS_FOR_COMPLETE} skills`,
      weight: 10,
      done: profile.skills.length >= SKILLS_FOR_COMPLETE,
    },
    { key: "languages", section: "languages", prompt: "Add a language", weight: 5, done: profile.languages.length > 0 },
  ];
  const items = photoAvailable ? all : all.filter((item) => item.key !== "photo");
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const earned = items.reduce((sum, item) => sum + (item.done ? item.weight : 0), 0);
  return {
    percent: total === 0 ? 0 : Math.round((earned / total) * 100),
    items,
    missing: items.filter((item) => !item.done),
  };
}

/* -------------------------------------------------------------------------- */
/* Validation messages                                                         */
/* -------------------------------------------------------------------------- */

const FIELD_LABELS: Record<string, string> = {
  displayName: "Display name",
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone",
  headline: "Headline",
  bio: "Bio",
  location: "Location",
  dateOfBirth: "Date of birth",
  website: "Website",
  linkedin: "LinkedIn",
  github: "GitHub",
  x: "X",
  title: "Job title",
  organisation: "Organisation",
  start: "Start date",
  end: "End date",
  description: "Description",
  school: "School",
  qualification: "Qualification",
  field: "Field of study",
  startYear: "Start year",
  endYear: "End year",
  name: "Name",
  issuer: "Issuer",
  issued: "Issue date",
  expires: "Expiry date",
  credentialId: "Credential ID",
  credentialUrl: "Credential link",
  proofKey: "Proof document",
  proficiency: "Proficiency",
  level: "Level",
  key: "Photo",
};

/**
 * One sentence a person can act on, from a failed save.
 *
 * Zod reports `value.1.end: …`; a learner needs "Experience, entry 2, end
 * date: The end date can't be before the start date."
 */
export function describeProfileIssue(error: z.ZodError, section?: string): string {
  const issue = error.issues[0];
  if (!issue) return "Check what you entered and try again.";
  const path = issue.path.filter((part) => part !== "value" && part !== "section");
  const index = path.find((part): part is number => typeof part === "number");
  const fieldKey = [...path].reverse().find((part): part is string => typeof part === "string");
  const sectionLabel =
    section && (PROFILE_SECTIONS as readonly string[]).includes(section)
      ? PROFILE_SECTION_LABELS[section as ProfileSection]
      : null;
  const where = [
    sectionLabel,
    index !== undefined ? `entry ${index + 1}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const fieldLabel = fieldKey ? FIELD_LABELS[fieldKey] : null;
  // "Experience, entry 2, end date" reads as one phrase; a label on its own keeps its capital.
  const lead = where && fieldLabel ? `${where}, ${fieldLabel.toLowerCase()}` : where || fieldLabel;
  return lead ? `${lead}: ${issue.message}` : issue.message;
}

/** Field name → message, for showing each problem beside its input. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.filter((part): part is string => typeof part === "string").join(".");
    if (key && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/** "12 Apr 1998", from a stored `YYYY-MM-DD`. Hand-built for the same reason as `formatMonth`. */
export function formatDay(value: string | null | undefined): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return "";
  const monthName = MONTH_NAMES[Number(match[2]) - 1];
  return monthName ? `${Number(match[3])} ${monthName} ${match[1]}` : "";
}

/** Month names for a month picker, in calendar order. */
export const MONTH_OPTIONS = MONTH_NAMES.map((label, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label,
}));

export const PROFILE_YEAR_RANGE = { min: MIN_YEAR, max: MAX_YEAR } as const;

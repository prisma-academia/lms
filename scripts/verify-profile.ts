/**
 * The learner profile, as pure logic.
 *
 * A profile is the one place a learner decides what staff see, and it lives in
 * a JSON column that older releases wrote to. So the things worth proving are:
 *
 *  - anything already stored still loads (reading never throws);
 *  - nothing hostile gets in: markup, script links, other people's files;
 *  - saving one section leaves every other section exactly as it was.
 *
 * No database, no storage, no network.
 *
 *   npm run verify:profile
 */
import {
  EMPTY_PROFILE,
  PROFILE_LIMITS,
  applySectionPatch,
  birthDateProblem,
  certificationEntrySchema,
  cleanText,
  dateRangeProblem,
  describeProfileIssue,
  educationEntrySchema,
  experienceEntrySchema,
  fieldErrors,
  foreignProfileKeys,
  formatMonth,
  formatMonthRange,
  formatYearRange,
  isOwnAvatarKey,
  isOwnDocumentKey,
  normaliseHttpsUrl,
  parseClientProfile,
  profileCompleteness,
  profilePatchSchema,
  profileStorageKeys,
  type ClientProfile,
  type ProfilePatch,
} from "../lib/schemas/client-profile";

let failed = 0;
let total = 0;

function check(label: string, actual: unknown, expected: unknown) {
  total++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n      got  ${a}\n      want ${e}`}`);
}

/** Parse a patch that is expected to be accepted. */
function accept(body: unknown): ProfilePatch {
  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) throw new Error(`expected a valid patch: ${describeProfileIssue(parsed.error)}`);
  return parsed.data;
}

/** The message a learner would see for a patch that is expected to be refused. */
function refusal(body: unknown): string | null {
  const parsed = profilePatchSchema.safeParse(body);
  const section = (body as { section?: string } | null)?.section;
  return parsed.success ? null : describeProfileIssue(parsed.error, section);
}

const OWNER = { tenantId: "ten1abc", clientId: "cli1abc" };
const OWN_AVATAR = "tenants/ten1abc/clients/cli1abc/avatar-0123456789abcdef.webp";
const OWN_DOC = "tenants/ten1abc/clients/cli1abc/documents/0123456789abcdef.pdf";
const OTHER_AVATAR = "tenants/ten1abc/clients/cli2xyz/avatar-0123456789abcdef.webp";
const OTHER_DOC = "tenants/ten1abc/clients/cli2xyz/documents/0123456789abcdef.pdf";
const OTHER_TENANT_DOC = "tenants/ten9zzz/clients/cli1abc/documents/0123456789abcdef.pdf";

/* -------------------------------------------------------------------------- */
/* Profiles that already exist                                                 */
/* -------------------------------------------------------------------------- */

check("a profile from before any of this — just a name — loads", parseClientProfile({ name: "Rashida Haruna" }), {
  ...EMPTY_PROFILE,
  displayName: "Rashida Haruna",
});

check(
  "the demo seed's `state` is read as the location until the learner sets one",
  [
    parseClientProfile({ name: "Rashida Haruna", state: "Lagos" }).location,
    parseClientProfile({ name: "R", state: "Lagos", location: "Abuja" }).location,
  ],
  ["Lagos", "Abuja"]
);

check(
  "anything that is not a profile at all loads as an empty one",
  [null, undefined, "text", 42, [], true].map((stored) => parseClientProfile(stored)),
  Array.from({ length: 6 }, () => EMPTY_PROFILE)
);

check(
  "fields of the wrong type are dropped one at a time, never the whole profile",
  (() => {
    const p = parseClientProfile({
      name: "Ada",
      headline: 7,
      bio: { nested: true },
      links: "not an object",
      experience: "not a list",
      education: [null, 3, "x"],
      skills: [{ name: "SQL" }, { nope: 1 }, { name: "Python", level: "wizard" }],
      avatarKey: 12,
    });
    return [p.displayName, p.headline, p.bio, p.links, p.experience, p.education, p.skills.map((s) => [s.name, s.level]), p.avatarKey];
  })(),
  ["Ada", null, null, EMPTY_PROFILE.links, [], [], [["SQL", null]], null]
);

let threw = false;
try {
  const hostile: Record<string, unknown> = {};
  Object.defineProperty(hostile, "name", {
    enumerable: true,
    get() {
      throw new Error("boom");
    },
  });
  parseClientProfile(hostile);
  parseClientProfile({ experience: [{ title: "x".repeat(50_000) }], skills: new Array(5000).fill({ name: "a" }) });
} catch {
  threw = true;
}
check("reading never throws, even on a value built to make it", threw, false);

check(
  "keys this module does not know are ignored on read",
  Object.keys(parseClientProfile({ name: "Ada", state: "Lagos", referral: "x", theme: "dark" })).sort(),
  Object.keys(EMPTY_PROFILE).sort()
);

/* -------------------------------------------------------------------------- */
/* Plain text only                                                             */
/* -------------------------------------------------------------------------- */

check(
  "markup is stripped from text",
  [
    cleanText("Hello <b>world</b>"),
    cleanText('<script>alert(1)</script>Engineer'),
    cleanText('<img src=x onerror="alert(1)">Ada'),
    cleanText("<!-- hidden -->Visible"),
  ],
  ["Hello world", "alert(1)Engineer", "Ada", "Visible"]
);

check(
  "a tag rebuilt by removing a tag is removed too",
  [cleanText("<scr<script>ipt>alert(1)</scr</script>ipt>"), cleanText("<<b>script>x")],
  ["alert(1)", "x"]
);

check("a tag that is never closed loses its opening bracket", cleanText("Hi <script src=//evil.test/x.js"), "Hi script src=//evil.test/x.js");

check(
  "ordinary uses of < and > survive",
  [cleanText("I <3 SQL"), cleanText("revenue > costs and 2 < 3"), cleanText("C++ & R")],
  ["I <3 SQL", "revenue > costs and 2 < 3", "C++ & R"]
);

check(
  "invisible and direction-flipping characters are removed",
  [cleanText("Ada\u0000\u0007 Okafor"), cleanText("evil‮gpj.exe"), cleanText("zero​width"), cleanText("﻿BOM")],
  ["Ada Okafor", "evilgpj.exe", "zerowidth", "BOM"]
);

check(
  "single-line text collapses whitespace; multi-line keeps paragraphs",
  [cleanText("  a \n\n b\t c  "), cleanText("line one  \r\n\r\n\r\n\r\n  line two\n", true)],
  ["a b c", "line one\n\nline two"]
);

const hostileBasics = accept({
  section: "basics",
  value: {
    displayName: "<b>Ada</b> Okafor",
    headline: '<a href="javascript:alert(1)">Data analyst</a>',
    bio: "First paragraph.<script>fetch('//evil.test')</script>\n\nSecond <i>paragraph</i>.",
    location: "Lagos<iframe src=x>",
  },
});
check(
  "a saved section holds text, never markup",
  hostileBasics.section === "basics"
    ? [hostileBasics.value.displayName, hostileBasics.value.headline, hostileBasics.value.bio, hostileBasics.value.location]
    : null,
  ["Ada Okafor", "Data analyst", "First paragraph.fetch('//evil.test')\n\nSecond paragraph.", "Lagos"]
);
check("…with no tag left anywhere in it", /<[a-zA-Z/!]/.test(JSON.stringify(hostileBasics)), false);

check(
  "a name that is only markup is not a name",
  refusal({ section: "basics", value: { displayName: "<b></b>" } }),
  "About you, display name: Enter the name you'd like to be called."
);

check(
  "markup stored by some other route is still plain text when read",
  (() => {
    const p = parseClientProfile({ name: "<i>Ada</i>", headline: "<script>x</script>Analyst", bio: "a<br>b" });
    return [p.displayName, p.headline, p.bio];
  })(),
  ["Ada", "xAnalyst", "ab"]
);

/* -------------------------------------------------------------------------- */
/* Links                                                                       */
/* -------------------------------------------------------------------------- */

const url = (input: string, hosts: string[] | null = null) => {
  const result = normaliseHttpsUrl(input, hosts);
  return result.ok ? result.url : `REFUSED: ${result.reason}`;
};

check(
  "https links are kept; a missing scheme is assumed to be https",
  [url("https://ada.example/cv"), url("ada.example"), url("  https://Ada.Example/Path?q=1  ")],
  ["https://ada.example/cv", "https://ada.example/", "https://ada.example/Path?q=1"]
);

check(
  "every scheme but https is refused, not rewritten",
  [
    url("javascript:alert(1)"),
    url("JaVaScRiPt:alert(1)"),
    url("http://ada.example"),
    url("data:text/html,<script>alert(1)</script>"),
    url("vbscript:msgbox(1)"),
    url("file:///etc/passwd"),
    url("ftp://ada.example"),
  ],
  Array.from({ length: 7 }, () => "REFUSED: Links must start with https://")
);

check(
  "tricks that hide the real destination are refused",
  [
    url("https://linkedin.com@evil.test/in/ada"),
    url("https://user:pw@ada.example"),
    url("https://localhost/admin"),
    url("https://ada.example/a b"),
    url("java\tscript:alert(1)"),
  ],
  [
    "REFUSED: A link can't include a username or password.",
    "REFUSED: A link can't include a username or password.",
    "REFUSED: That doesn't look like a link.",
    "REFUSED: A link can't contain spaces.",
    "REFUSED: A link can't contain spaces.",
  ]
);

check(
  "a named link must point at the site it is named for",
  [
    url("linkedin.com/in/ada", ["linkedin.com"]),
    url("https://ng.linkedin.com/in/ada", ["linkedin.com"]),
    url("https://linkedin.com.evil.test/in/ada", ["linkedin.com"]),
    url("https://notlinkedin.com/in/ada", ["linkedin.com"]),
    url("https://twitter.com/ada", ["x.com", "twitter.com"]),
  ],
  [
    "https://linkedin.com/in/ada",
    "https://ng.linkedin.com/in/ada",
    "REFUSED: This must be a linkedin.com link.",
    "REFUSED: This must be a linkedin.com link.",
    "https://twitter.com/ada",
  ]
);

check(
  "a bad link fails the save and says which one",
  [
    refusal({ section: "basics", value: { displayName: "Ada", links: { website: "javascript:alert(1)" } } }),
    refusal({ section: "basics", value: { displayName: "Ada", links: { github: "https://gitlab.com/ada" } } }),
    refusal({
      section: "certifications",
      value: [{ name: "AWS SAA", issuer: "AWS", credentialUrl: "http://verify.example/1" }],
    }),
  ],
  [
    "About you, website: Links must start with https://",
    "About you, github: This must be a github.com link.",
    "Certifications, entry 1, credential link: Links must start with https://",
  ]
);

check(
  "a bad link already in storage is dropped on read, not shown",
  parseClientProfile({ name: "Ada", links: { website: "javascript:alert(1)", linkedin: "http://linkedin.com/in/a", github: "https://github.com/ada" } }).links,
  { website: null, linkedin: null, github: "https://github.com/ada", x: null }
);

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

check(
  "an end before its start, and a current role with an end, are both wrong",
  [
    dateRangeProblem({ start: "2022-03", end: "2021-12" }),
    dateRangeProblem({ start: "2022-03", end: "2022-03" }),
    dateRangeProblem({ start: "2022-03", end: "2023-01", current: true }),
    dateRangeProblem({ start: "2022-03", end: null, current: true }),
  ],
  ["The end date can't be before the start date.", null, "A current role has no end date.", null]
);

const role = (extra: Record<string, unknown>) => ({ title: "Analyst", organisation: "Kuda", start: "2022-03", ...extra });
const experienceResult = (extra: Record<string, unknown>) => {
  const parsed = experienceEntrySchema.safeParse(role(extra));
  return parsed.success ? [parsed.data.end, parsed.data.current] : fieldErrors(parsed.error);
};
check(
  "experience entries are held to those rules",
  [
    experienceResult({ end: "2023-08" }),
    experienceResult({ current: true }),
    experienceResult({ end: "2021-01" }),
    experienceResult({ current: true, end: "2023-08" }),
    experienceResult({}),
    experienceResult({ start: "2022-13", current: true }),
    experienceResult({ start: "March 2022", current: true }),
  ],
  [
    ["2023-08", false],
    [null, true],
    { end: "The end date can't be before the start date." },
    { end: "A current role has no end date." },
    { end: "Add an end date, or mark this as your current role." },
    { start: "Choose a month and year." },
    { start: "Choose a month and year." },
  ]
);

const school = (extra: Record<string, unknown>) => {
  const parsed = educationEntrySchema.safeParse({ school: "UNILAG", ...extra });
  return parsed.success ? [parsed.data.startYear, parsed.data.endYear] : fieldErrors(parsed.error);
};
check(
  "education years must be real years, in order",
  [school({ startYear: 2015, endYear: 2019 }), school({ startYear: "2015", endYear: "" }), school({ startYear: 2019, endYear: 2015 }), school({ startYear: 19 }), school({ endYear: 20199 })],
  [
    [2015, 2019],
    [2015, null],
    { endYear: "The end year can't be before the start year." },
    { startYear: "Enter a year between 1940 and 2099." },
    { endYear: "Enter a year between 1940 and 2099." },
  ]
);

const certification = (extra: Record<string, unknown>) => {
  const parsed = certificationEntrySchema.safeParse({ name: "PMP", issuer: "PMI", ...extra });
  return parsed.success ? "ok" : fieldErrors(parsed.error);
};
check(
  "a certification cannot expire before it was issued",
  [certification({ issued: "2023-05", expires: "2026-05" }), certification({ issued: "2023-05", expires: "2022-05" }), certification({})],
  ["ok", { expires: "The expiry date can't be before the issue date." }, "ok"]
);

const NOW = new Date("2026-11-26T12:00:00Z");
check(
  "a date of birth must be a real day, from 1900 on, and not in the future",
  [
    birthDateProblem("1998-04-12", NOW),
    birthDateProblem("2023-02-30", NOW),
    birthDateProblem("1899-12-31", NOW),
    birthDateProblem("2030-01-01", NOW),
    birthDateProblem("12/04/1998", NOW),
    birthDateProblem("2026-11-26", NOW),
  ],
  [null, "That date doesn't exist.", "Enter a year from 1900 on.", "A date of birth can't be in the future.", "Enter a date as year, month and day.", null]
);

check(
  "dates read the same on any machine",
  [formatMonth("2022-03"), formatMonth("nonsense"), formatMonthRange("2022-03", "2023-08"), formatMonthRange("2022-03", null, true), formatMonthRange(null, "2026-05"), formatYearRange(2015, 2019), formatYearRange(2019, 2019), formatYearRange(null, 2019)],
  ["Mar 2022", "", "Mar 2022 to Aug 2023", "Mar 2022 to present", "May 2026", "2015 to 2019", "2019", "2019"]
);

/* -------------------------------------------------------------------------- */
/* Size limits                                                                 */
/* -------------------------------------------------------------------------- */

check(
  "each list has a cap, and the refusal says what it is",
  [
    refusal({ section: "experience", value: Array.from({ length: PROFILE_LIMITS.experience + 1 }, () => role({ current: true })) }),
    refusal({ section: "skills", value: Array.from({ length: PROFILE_LIMITS.skills + 1 }, (_, i) => ({ name: `Skill ${i}` })) }),
    refusal({ section: "languages", value: Array.from({ length: PROFILE_LIMITS.languages + 1 }, (_, i) => ({ name: `L${i}`, proficiency: "basic" })) }),
  ],
  [
    "Experience: You can list up to 20 roles.",
    "Skills: You can list up to 40 skills.",
    "Languages: You can list up to 12 languages.",
  ]
);

check(
  "each field has a cap",
  [
    refusal({ section: "basics", value: { displayName: "Ada", headline: "h".repeat(PROFILE_LIMITS.headline + 1) } }),
    refusal({ section: "basics", value: { displayName: "Ada", bio: "b".repeat(PROFILE_LIMITS.bio + 1) } }),
    refusal({ section: "basics", value: { displayName: "Ada", bio: "b".repeat(50_000) } }),
    refusal({ section: "skills", value: [{ name: "s".repeat(PROFILE_LIMITS.skillName + 1) }] }),
  ],
  [
    "About you, headline: Keep this to 120 characters or fewer.",
    "About you, bio: Keep this to 1500 characters or fewer.",
    "About you, bio: That is too long.",
    "Skills, entry 1, name: Keep this to 40 characters or fewer.",
  ]
);

check(
  "an oversized list already in storage is cut to the cap on read",
  [
    parseClientProfile({ skills: Array.from({ length: 500 }, (_, i) => ({ name: `Skill ${i}` })) }).skills.length,
    parseClientProfile({ experience: Array.from({ length: 500 }, () => role({ current: true })) }).experience.length,
  ],
  [PROFILE_LIMITS.skills, PROFILE_LIMITS.experience]
);

check(
  "a phone number must look like one",
  [
    refusal({ section: "basics", value: { displayName: "Ada", phone: "+234 801 234 5678" } }),
    refusal({ section: "basics", value: { displayName: "Ada", phone: "call me maybe" } }),
    refusal({ section: "basics", value: { displayName: "Ada", phone: "" } }),
  ],
  [null, "About you, phone: Enter a phone number, such as +234 801 234 5678.", null]
);

check(
  "an unknown section, or no section, is refused",
  [refusal({ section: "passwordHash", value: "x" }) !== null, refusal({ value: [] }) !== null, refusal(null) !== null, refusal("experience") !== null],
  [true, true, true, true]
);

check(
  "the same skill twice is kept once, whatever its capitals",
  (() => {
    const patch = accept({ section: "skills", value: [{ name: "SQL" }, { name: "sql", level: "expert" }, { name: "Python" }] });
    return patch.section === "skills" ? patch.value.map((s) => s.name) : null;
  })(),
  ["SQL", "Python"]
);

check(
  "entries are given ids, and two entries never share one",
  (() => {
    const patch = accept({
      section: "languages",
      value: [
        { id: "abc123", name: "Yoruba", proficiency: "native" },
        { id: "abc123", name: "English", proficiency: "fluent" },
        { id: "<script>", name: "Hausa", proficiency: "basic" },
        { name: "French", proficiency: "basic" },
      ],
    });
    if (patch.section !== "languages") return null;
    const ids = patch.value.map((l) => l.id);
    return [ids[0], new Set(ids).size, ids.every((id) => /^[a-z0-9]{6,32}$/.test(id))];
  })(),
  ["abc123", 4, true]
);

/* -------------------------------------------------------------------------- */
/* Other people's files                                                        */
/* -------------------------------------------------------------------------- */

check(
  "a learner's own keys are theirs; anybody else's are not",
  [
    isOwnAvatarKey(OWN_AVATAR, OWNER),
    isOwnDocumentKey(OWN_DOC, OWNER),
    isOwnAvatarKey(OTHER_AVATAR, OWNER),
    isOwnDocumentKey(OTHER_DOC, OWNER),
    isOwnDocumentKey(OTHER_TENANT_DOC, OWNER),
    // The right prefix on the wrong kind of file.
    isOwnAvatarKey(OWN_DOC, OWNER),
    isOwnDocumentKey(OWN_AVATAR, OWNER),
  ],
  [true, true, false, false, false, false, false]
);

check(
  "a patch pointing at somebody else's file is caught",
  [
    foreignProfileKeys(accept({ section: "avatar", value: { key: OWN_AVATAR } }), OWNER),
    foreignProfileKeys(accept({ section: "avatar", value: { key: OTHER_AVATAR } }), OWNER),
    foreignProfileKeys(accept({ section: "avatar", value: { key: null } }), OWNER),
    foreignProfileKeys(
      accept({
        section: "certifications",
        value: [
          { name: "A", issuer: "X", proofKey: OWN_DOC },
          { name: "B", issuer: "X", proofKey: OTHER_DOC },
          { name: "C", issuer: "X", proofKey: OTHER_TENANT_DOC },
          { name: "D", issuer: "X" },
        ],
      }),
      OWNER
    ),
  ],
  [[], [OTHER_AVATAR], [], [OTHER_DOC, OTHER_TENANT_DOC]]
);

check(
  "a key that is not a profile file at all never gets as far as that check",
  [
    refusal({ section: "avatar", value: { key: "tenants/ten1abc/branding/logo-0123456789abcdef.png" } }),
    refusal({ section: "avatar", value: { key: "tenants/ten1abc/clients/cli1abc/../../library/x.webp" } }),
    refusal({ section: "avatar", value: { key: "https://evil.test/a.png" } }),
    refusal({ section: "avatar", value: { key: OWN_AVATAR.replace(".webp", ".svg") } }),
    refusal({ section: "certifications", value: [{ name: "A", issuer: "X", proofKey: "tenants/ten1abc/submissions/0123456789abcdef.pdf" }] }),
    refusal({ section: "certifications", value: [{ name: "A", issuer: "X", proofKey: OWN_AVATAR }] }),
  ],
  [
    "Photo, photo: That file can't be used here.",
    "Photo, photo: That file can't be used here.",
    "Photo, photo: That file can't be used here.",
    "Photo, photo: That file can't be used here.",
    "Certifications, entry 1, proof document: That file can't be used here.",
    "Certifications, entry 1, proof document: That file can't be used here.",
  ]
);

check(
  "a key of the wrong shape already in storage is not handed back on read",
  (() => {
    const p = parseClientProfile({
      avatarKey: "tenants/ten1abc/library/secret.pdf",
      certifications: [
        { name: "Kept", issuer: "X", proofKey: OWN_DOC },
        { name: "Dropped", issuer: "X", proofKey: "tenants/ten1abc/library/secret.pdf" },
      ],
    });
    return [p.avatarKey, p.certifications.map((c) => c.name), profileStorageKeys(p)];
  })(),
  [null, ["Kept"], [OWN_DOC]]
);

/* -------------------------------------------------------------------------- */
/* Saving one section                                                          */
/* -------------------------------------------------------------------------- */

const STORED = {
  name: "Ada Okafor",
  state: "Lagos",
  somethingElse: { keep: ["me"] },
  headline: "Data analyst",
  links: { website: "https://ada.example/", linkedin: null, github: null, x: null },
  avatarKey: OWN_AVATAR,
  experience: [{ id: "exp0001", title: "Analyst", organisation: "Kuda", location: null, start: "2022-03", end: null, current: true, description: null }],
  skills: [{ id: "skl0001", name: "SQL", level: "advanced" }],
};
const snapshot = JSON.stringify(STORED);

const afterSkills = applySectionPatch(STORED, accept({ section: "skills", value: [{ id: "skl0001", name: "SQL", level: "expert" }, { name: "Python" }] }));
const untouched = (after: Record<string, unknown>, section: string) =>
  Object.keys(STORED)
    .filter((key) => key !== section)
    .every((key) => JSON.stringify(after[key]) === JSON.stringify((STORED as Record<string, unknown>)[key]));

check("saving skills changes skills", (afterSkills.skills as { name: string; level: string | null }[]).map((s) => [s.name, s.level]), [["SQL", "expert"], ["Python", null]]);
check("…and nothing else, including keys this module has never heard of", untouched(afterSkills, "skills"), true);
check("…and never alters the object it was given", JSON.stringify(STORED), snapshot);

const afterExperience = applySectionPatch(STORED, accept({ section: "experience", value: [] }));
check("clearing a section empties that section only", [afterExperience.experience, untouched(afterExperience, "experience")], [[], true]);

const afterAvatar = applySectionPatch(STORED, accept({ section: "avatar", value: { key: null } }));
check("removing the photo touches only the photo", [afterAvatar.avatarKey, untouched(afterAvatar, "avatarKey")], [null, true]);

const afterBasics = applySectionPatch(
  STORED,
  accept({ section: "basics", value: { displayName: "Ada O.", headline: "", location: "", links: { website: "" } } })
);
check(
  "saving the basics sets its own keys, and clears the ones left empty",
  [afterBasics.name, afterBasics.headline, afterBasics.location, (afterBasics.links as { website: string | null }).website],
  ["Ada O.", null, null, null]
);
check(
  "…leaves lists, the photo and unknown keys alone",
  ["experience", "skills", "avatarKey", "somethingElse"].every(
    (key) => JSON.stringify(afterBasics[key]) === JSON.stringify((STORED as Record<string, unknown>)[key])
  ),
  true
);
check(
  "…and retires the legacy `state`, so a cleared location stays cleared",
  ["state" in afterBasics, parseClientProfile(afterBasics).location],
  [false, null]
);

// Two tabs, two sections. Each save is applied to the row as it stands, so the
// order does not matter and neither undoes the other.
const tabA = accept({ section: "education", value: [{ school: "UNILAG", startYear: 2015, endYear: 2019 }] });
const tabB = accept({ section: "languages", value: [{ name: "Yoruba", proficiency: "native" }] });
const ab = parseClientProfile(applySectionPatch(applySectionPatch(STORED, tabA), tabB));
const ba = parseClientProfile(applySectionPatch(applySectionPatch(STORED, tabB), tabA));
check(
  "two sections saved one after the other both survive, in either order",
  [ab.education.length, ab.languages.length, ba.education.length, ba.languages.length, ab.skills.length, ba.experience.length],
  [1, 1, 1, 1, 1, 1]
);

check(
  "a profile with nothing stored can still have a section saved onto it",
  [applySectionPatch(null, tabB).languages !== undefined, Object.keys(applySectionPatch("garbage", tabB))],
  [true, ["languages"]]
);

check(
  "what is saved reads back exactly as it was saved",
  (() => {
    const patch = accept({
      section: "experience",
      value: [
        role({ end: "2023-08", description: "Built dashboards.\n\nRan the weekly report." }),
        { title: "Lead analyst", organisation: "Flutterwave", start: "2023-09", current: true, location: "Lagos" },
      ],
    });
    const saved = patch.section === "experience" ? patch.value : [];
    return JSON.stringify(parseClientProfile(applySectionPatch({}, patch)).experience) === JSON.stringify(saved);
  })(),
  true
);

check(
  "roles are ordered current first, then most recent",
  (() => {
    const patch = accept({
      section: "experience",
      value: [role({ start: "2019-01", end: "2020-01" }), role({ start: "2021-06", end: "2022-02" }), role({ start: "2020-02", current: true })],
    });
    return patch.section === "experience" ? patch.value.map((e) => e.start) : null;
  })(),
  ["2020-02", "2021-06", "2019-01"]
);

/* -------------------------------------------------------------------------- */
/* Completeness                                                                */
/* -------------------------------------------------------------------------- */

const empty: ClientProfile = { ...EMPTY_PROFILE, displayName: "Ada" };
check(
  "an empty profile is 0% complete, with everything still to do",
  [profileCompleteness(empty).percent, profileCompleteness(empty).missing.map((m) => m.key)],
  [0, ["photo", "headline", "bio", "location", "experience", "education", "certifications", "skills", "languages"]]
);

check("the weights add up to exactly 100", profileCompleteness(empty).items.reduce((sum, item) => sum + item.weight, 0), 100);

const full = parseClientProfile({
  name: "Ada",
  headline: "Data analyst",
  bio: "I turn spreadsheets into decisions.",
  location: "Lagos",
  avatarKey: OWN_AVATAR,
  experience: [role({ current: true })],
  education: [{ school: "UNILAG" }],
  certifications: [{ name: "PMP", issuer: "PMI" }],
  skills: [{ name: "SQL" }, { name: "Python" }, { name: "Excel" }],
  languages: [{ name: "Yoruba", proficiency: "native" }],
});
check("a full profile is 100% complete, with nothing missing", [profileCompleteness(full).percent, profileCompleteness(full).missing], [100, []]);

check(
  "each part counts for what it weighs",
  [
    profileCompleteness({ ...empty, headline: "x" }).percent,
    profileCompleteness({ ...empty, experience: full.experience }).percent,
    profileCompleteness({ ...empty, headline: "x", bio: "y", location: "z" }).percent,
    profileCompleteness({ ...empty, experience: full.experience, education: full.education }).percent,
  ],
  [10, 20, 30, 35]
);

check(
  "two skills are not yet a skills list; three are",
  [profileCompleteness({ ...empty, skills: full.skills.slice(0, 2) }).percent, profileCompleteness({ ...empty, skills: full.skills }).percent],
  [0, 10]
);

check(
  "a certificate earned here counts, so nobody retypes what the academy issued",
  [profileCompleteness(empty, { issuedCertificates: 1 }).percent, profileCompleteness(empty, { issuedCertificates: 0 }).percent],
  [10, 0]
);

const noPhoto = { ...full, avatarKey: null };
check(
  "where photos cannot be uploaded, the photo is not counted against anyone",
  [
    profileCompleteness(noPhoto).percent,
    profileCompleteness(noPhoto, { photoAvailable: false }).percent,
    profileCompleteness(noPhoto, { photoAvailable: false }).items.some((item) => item.key === "photo"),
    profileCompleteness({ ...empty, headline: "x" }, { photoAvailable: false }).percent,
  ],
  [90, 100, false, 11]
);

console.log(failed === 0 ? `\nAll ${total} profile checks passed.` : `\n${failed} of ${total} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);

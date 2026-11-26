/**
 * The learner profile, against the things `verify:profile` cannot reach.
 *
 * `verify:profile` proves the rules as pure logic. This proves the two parts
 * that only exist once there is a page and a row:
 *
 *  1. Every section renders — empty, full, and with each of its forms open —
 *     and nothing a learner typed comes out as markup. Rendered to a string, so
 *     it needs no browser.
 *  2. Saving works against the real database, and three sections saved at the
 *     same instant all survive. The profile is one JSON column; without the
 *     serializable transaction in lib/profile/save.ts the last write would
 *     erase the others, and no pure test can show that it does not.
 *
 * Runs against a throwaway learner in the demo academy, deleted in `finally`.
 * The "write conflict" lines Prisma prints during the last part are the
 * collisions being detected and retried — that is the mechanism working.
 *
 *   npm run verify:profile:live
 */
import "dotenv/config";
import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "../lib/db/client";
import { runWithContext } from "../lib/db/tenant-context";
import { saveProfileSection } from "../lib/profile/save";
import {
  EMPTY_PROFILE,
  parseClientProfile,
  profilePatchSchema,
  type ClientProfile,
  type ProfilePatch,
} from "../lib/schemas/client-profile";
import {
  ProfileEditorProvider,
  type OpenTarget,
  type ProfileEditorContext,
} from "../app/c/(dashboard)/profile/profile-ui";
import { BasicsSection } from "../app/c/(dashboard)/profile/basics-section";
import {
  CertificationsSection,
  EducationSection,
  ExperienceSection,
} from "../app/c/(dashboard)/profile/entry-sections";
import { LanguagesSection, SkillsSection } from "../app/c/(dashboard)/profile/list-sections";
import { ClientProfileView } from "../app/admin/(dashboard)/clients/[id]/client-profile-view";

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
}
const patch = (body: unknown): ProfilePatch => profilePatchSchema.parse(body);

const FULL = {
  name: "Ada Okafor",
  headline: "Data analyst",
  bio: "I turn spreadsheets into decisions.\n\nCurrently learning SQL.",
  location: "Lagos",
  dateOfBirth: "1998-04-12",
  links: { website: "https://ada.example", linkedin: "https://linkedin.com/in/ada", github: null, x: null },
  experience: [
    { title: "Analyst", organisation: "Kuda", start: "2022-03", current: true, description: "Dashboards." },
    { title: "Intern", organisation: "GTBank", location: "Lagos", start: "2021-01", end: "2021-06" },
  ],
  education: [{ school: "University of Lagos", qualification: "BSc", field: "Statistics", startYear: 2016, endYear: 2020 }],
  certifications: [
    {
      name: "PMP",
      issuer: "PMI",
      issued: "2023-05",
      expires: "2026-05",
      credentialId: "12345",
      credentialUrl: "https://verify.example/12345",
      proofKey: "tenants/t1abc/clients/c1abc/documents/0123456789abcdef.pdf",
    },
    { name: "Scrum Master", issuer: "Scrum.org" },
  ],
  skills: [{ name: "SQL", level: "advanced" }, { name: "Python" }, { name: "Excel", level: "expert" }],
  languages: [{ name: "Yoruba", proficiency: "native" }, { name: "English", proficiency: "fluent" }],
};

function render(profile: ClientProfile, open: OpenTarget | null, node: React.ReactNode): string {
  const context: ProfileEditorContext = {
    profile,
    account: { email: "ada@example.test", firstName: "Ada", lastName: "Okafor", phone: "+234 801 234 5678" },
    uploadsEnabled: true,
    open,
    requestOpen: () => true,
    guard: () => true,
    close: () => undefined,
    setDirty: () => undefined,
    refusals: 0,
    saving: false,
    save: async () => ({ ok: true }),
  };
  return renderToStaticMarkup(<ProfileEditorProvider value={context}>{node}</ProfileEditorProvider>);
}

function renders(label: string, fn: () => string, mustContain: string[] = []) {
  try {
    const html = fn();
    const missing = mustContain.filter((text) => !html.includes(text));
    check(label, missing.length === 0, `missing in output: ${JSON.stringify(missing)}`);
  } catch (error) {
    check(label, false, String(error));
  }
}

async function main() {
  /* ---- Rendering ---- */
  const full = parseClientProfile(FULL);
  const empty: ClientProfile = { ...EMPTY_PROFILE, displayName: "Ada" };
  const issued = [{ id: "aw1", name: "Data Analysis Certificate", earnedOn: "Intro to Data", serial: "CERT-0001", issuedLabel: "24 Nov 2026" }];
  const everything = (profile: ClientProfile, open: OpenTarget | null) =>
    render(
      profile,
      open,
      <>
        <BasicsSection />
        <ExperienceSection />
        <EducationSection />
        <CertificationsSection issued={issued} />
        <SkillsSection />
        <LanguagesSection />
      </>
    );

  renders("every section renders with nothing in it", () => everything(empty, null), [
    "No bio yet",
    "Add a role",
    "Add education",
    "Add a certification",
    "Add skills",
    "Add languages",
    "Earned here",
  ]);
  renders("every section renders full", () => everything(full, null), [
    "I turn spreadsheets into decisions.",
    "Mar 2022 to present",
    "Jan 2021 to Jun 2021",
    "University of Lagos",
    "2016 to 2020",
    "Issued May 2023, expires May 2026",
    "/api/client/profile/files?certification=",
    "Verify with the issuer",
    "Advanced",
    "Native or first language",
    "12 Apr 1998",
    "linkedin.com/in/ada",
  ]);
  renders("the basics form renders", () => everything(full, { section: "basics" }), ["Edit your details", "Display name", "Date of birth", "LinkedIn"]);
  renders("the add-a-role form renders", () => everything(full, { section: "experience", entryId: "new" }), ["Add a role", "I work here now", "Started, month"]);
  renders("the edit-a-role form renders", () => everything(full, { section: "experience", entryId: full.experience[0].id }), ["Edit this role", "Save role"]);
  renders("the education form renders", () => everything(full, { section: "education", entryId: full.education[0].id }), ["Edit this entry", "School or institution"]);
  renders("the certification form renders, with the proof upload", () => everything(full, { section: "certifications", entryId: full.certifications[0].id }), ["Edit this certification", "A document is attached.", 'type="file"']);
  renders("the new certification form renders", () => everything(empty, { section: "certifications", entryId: "new" }), ["Add a certification", "Verification link"]);
  renders("the skills form renders", () => everything(full, { section: "skills" }), ["Edit your skills", "Level for SQL", "Remove Python"]);
  renders("the languages form renders", () => everything(full, { section: "languages" }), ["Edit your languages", "How well", "Remove Yoruba"]);
  renders("the languages form opens on an empty row when there are none", () => everything(empty, { section: "languages" }), ["Remove language 1"]);

  renders(
    "the staff view renders a full profile",
    () => renderToStaticMarkup(<ClientProfileView clientId="c1" profile={full} avatarSrc="/api/tenant/clients/c1/profile-files?avatar=abc" issued={issued} />),
    ["Written by the learner", "Experience", "Open proof document", "/api/tenant/clients/c1/profile-files?certification=", "Issued here", "No proof or verification link provided.", "Yoruba"]
  );
  renders(
    "the staff view says so when there is nothing",
    () => renderToStaticMarkup(<ClientProfileView clientId="c1" profile={empty} avatarSrc={null} issued={[]} />),
    ["hasn’t added anything"]
  );
  const hostile = parseClientProfile({ name: "x", headline: '"><img src=x onerror=alert(1)>', bio: "<script>alert(1)</script>", skills: [{ name: "<b>bold</b>" }] });
  renders("nothing a learner typed comes out as markup", () => {
    const html = renderToStaticMarkup(<ClientProfileView clientId="c1" profile={hostile} avatarSrc={null} issued={[]} />) + everything(hostile, null);
    if (/<script|onerror=|<img src=x/i.test(html)) throw new Error("markup from profile text reached the page");
    return html;
  });

  /* ---- Saving, against the database ---- */
  const tenant = await prisma.tenant.findFirst({ where: { slug: "demo" }, select: { id: true } });
  if (!tenant) throw new Error("demo tenant not found");

  await runWithContext({ mode: "tenant-client", tenantId: tenant.id }, async () => {
    const stamp = Date.now();
    const client = await prisma.client.create({
      data: {
        tenantId: tenant.id,
        email: `tmp-profile-${stamp}@example.test`,
        profileJson: { name: "Temp Learner", state: "Lagos", somethingElse: { keep: true } },
      },
      select: { id: true },
    });
    try {
      const basics = await saveProfileSection(
        client.id,
        patch({ section: "basics", value: { displayName: "Temp L.", firstName: "Temp", lastName: "Learner", phone: "+234 801 234 5678", headline: "Tester", links: { github: "github.com/temp" } } })
      );
      const afterBasics = parseClientProfile(basics.updated.profileJson);
      check(
        "saving the basics writes the JSON keys and the name and phone columns",
        afterBasics.displayName === "Temp L." &&
          afterBasics.headline === "Tester" &&
          afterBasics.links.github === "https://github.com/temp" &&
          basics.updated.firstName === "Temp" &&
          basics.updated.phone === "+234 801 234 5678",
        JSON.stringify(basics.updated)
      );
      check(
        "…keeps keys it does not know, and reports what it replaced",
        (basics.updated.profileJson as { somethingElse?: { keep?: boolean } }).somethingElse?.keep === true &&
          (basics.previous as { name?: string }).name === "Temp Learner"
      );

      await saveProfileSection(client.id, patch({ section: "experience", value: FULL.experience }));
      await saveProfileSection(client.id, patch({ section: "skills", value: FULL.skills }));
      const stored = parseClientProfile((await prisma.client.findUnique({ where: { id: client.id }, select: { profileJson: true } }))?.profileJson);
      check(
        "sections saved one after another are all there",
        stored.experience.length === 2 && stored.skills.length === 3 && stored.headline === "Tester",
        JSON.stringify([stored.experience.length, stored.skills.length, stored.headline])
      );
      check("a non-basics save leaves the name columns alone", (await prisma.client.findUnique({ where: { id: client.id }, select: { firstName: true } }))?.firstName === "Temp");

      // The case the transaction exists for: two sections saved at the same
      // instant. Without it, whichever writes last erases the other.
      let survived = 0;
      const rounds = 6;
      for (let round = 0; round < rounds; round++) {
        await Promise.all([
          saveProfileSection(client.id, patch({ section: "education", value: [{ school: `School ${round}`, startYear: 2010 + round }] })),
          saveProfileSection(client.id, patch({ section: "languages", value: [{ name: `Language ${round}`, proficiency: "basic" }] })),
          saveProfileSection(client.id, patch({ section: "certifications", value: [{ name: `Cert ${round}`, issuer: "X" }] })),
        ]);
        const now = parseClientProfile((await prisma.client.findUnique({ where: { id: client.id }, select: { profileJson: true } }))?.profileJson);
        if (
          now.education[0]?.school === `School ${round}` &&
          now.languages[0]?.name === `Language ${round}` &&
          now.certifications[0]?.name === `Cert ${round}` &&
          now.experience.length === 2 &&
          now.skills.length === 3
        ) {
          survived++;
        }
      }
      check(`three sections saved at the same instant all survive (${survived} of ${rounds} rounds)`, survived === rounds);

      let missing = "";
      try {
        await saveProfileSection("no-such-client", patch({ section: "skills", value: [] }));
      } catch (error) {
        missing = (error as { code?: string }).code ?? String(error);
      }
      check("a learner that does not exist is a clean 404, not a crash", missing === "not_found", missing);
    } finally {
      await prisma.client.delete({ where: { id: client.id } });
      console.log("\nDeleted the throwaway learner.");
    }
  });

  console.log(failed === 0 ? "\nAll live profile checks passed." : `\n${failed} check(s) FAILED.`);
}

main()
  .catch((error) => {
    console.error("\nVerification crashed:", error);
    failed++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });

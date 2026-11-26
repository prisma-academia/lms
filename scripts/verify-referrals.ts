/**
 * Return-to links, referral codes and referral attribution.
 *
 * Three things here can hurt someone if they are wrong:
 *
 *  - `safeNextPath` decides where the sign-in page sends a person afterwards.
 *    Too loose and this academy's own sign-in becomes a redirect to an
 *    attacker's site, with the academy's address in the link.
 *  - referral codes are typed by hand, so their format decides whether people
 *    can actually use them.
 *  - attribution must never get in the way: an unknown, switched-off or
 *    self-serving code is ignored, the same event is never counted twice, and
 *    nothing in here may throw into a registration or a payment.
 *
 *   npx tsx scripts/verify-referrals.ts               # pure checks + database
 *   npx tsx scripts/verify-referrals.ts --no-db       # pure checks only
 *   npx tsx scripts/verify-referrals.ts --tenant demo
 *
 * The database part creates one throwaway staff member and a few throwaway
 * learners inside a real academy and deletes them again in `finally`.
 */
import "dotenv/config";
import { authHref, safeNextPath, sessionEndedHref } from "../lib/auth/next-path";
import {
  CODE_ALPHABET,
  generateReferralCode,
  normalizeReferralCode,
  withReferralCode,
} from "../lib/referrals/code-format";

const args = process.argv.slice(2);
const skipDb = args.includes("--no-db");
const tenantSlug = args.includes("--tenant") ? args[args.indexOf("--tenant") + 1] : "demo";

let failed = 0;
let total = 0;

function check(label: string, ok: boolean, detail?: string) {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
}

function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(label, a === e, `got  ${a}\n      want ${e}`);
}

/* -------------------------------------------------------------------------- */
/* Where sign-in may send someone                                              */
/* -------------------------------------------------------------------------- */

function pureChecks() {
  const kept: [string, string][] = [
    ["/courses", "/courses"],
    ["/courses/intro-to-budgeting", "/courses/intro-to-budgeting"],
    ["/courses/intro/learn?lesson=abc123", "/courses/intro/learn?lesson=abc123"],
    ["/courses?q=two%20words", "/courses?q=two%20words"],
    ["/programmes/data-science", "/programmes/data-science"],
    ["/dashboard", "/dashboard"],
    ["/library/item-1", "/library/item-1"],
    ["/certificates", "/certificates"],
    // A fragment is dropped, not refused: it never reaches a server anyway.
    ["/courses/intro#outline", "/courses/intro"],
    // Dot segments are resolved to what the browser would actually request.
    ["/courses/a/../b", "/courses/b"],
  ];
  for (const [input, want] of kept) {
    eq(`a learner path is kept: ${input}`, safeNextPath(input), want);
  }

  const refused: [string, unknown][] = [
    ["another site, protocol-relative", "//evil.test"],
    ["another site, protocol-relative with a learner path", "//evil.test/courses"],
    ["another site, triple slash", "///evil.test"],
    ["a backslash the browser reads as a slash", "/\\evil.test"],
    ["a leading backslash", "\\/evil.test"],
    ["two backslashes", "\\\\evil.test"],
    ["a backslash further in", "/courses\\..\\..\\evil.test"],
    ["an absolute https URL", "https://evil.test"],
    ["an absolute http URL to a learner path", "http://evil.test/courses"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a data: URL", "data:text/html,<script>alert(1)</script>"],
    ["the staff admin", "/admin"],
    ["a page inside the staff admin", "/admin/dashboard"],
    ["the API", "/api/x"],
    ["a real API route", "/api/auth/logout"],
    ["the sign-in page itself", "/auth/login"],
    ["the sign-in page, looping", "/auth/login?next=/courses"],
    ["the site's home page", "/"],
    ["one of the site's own pages", "/about"],
    ["an internal rewrite target", "/t/courses"],
    ["another internal rewrite target", "/c/dashboard"],
    ["a path with no leading slash", "courses/intro"],
    ["a leading space", " /courses"],
    ["a trailing newline", "/courses\n"],
    ["a tab the URL parser would drop", "/\t/evil.test"],
    ["a carriage return", "/courses\r/x"],
    ["a null byte", "/courses/\u0000"],
    ["an encoded null byte", "/courses/%00"],
    ["encoded slashes", "/%2F%2Fevil.test"],
    ["an encoded slash, lower case", "/%2f/evil.test"],
    ["an encoded backslash", "/%5Cevil.test"],
    ["dot segments escaping to the admin", "/courses/../admin"],
    ["encoded dot segments escaping to the admin", "/courses/%2e%2e/admin"],
    ["an encoded slash hiding dot segments", "/courses/..%2fadmin"],
    ["a section name glued to an encoded slash", "/courses%2f..%2fadmin"],
    ["a longer word starting with a section name", "/coursesevil"],
    ["a host dressed as a section", "/courses.evil.test"],
    ["credentials syntax", "/courses@evil.test"],
    ["an empty string", ""],
    ["a very long path", `/courses/${"a".repeat(600)}`],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an array", ["/courses"]],
  ];
  for (const [label, input] of refused) {
    eq(`refused: ${label}`, safeNextPath(input), null);
  }

  // Whatever comes back is used in a redirect. It must be a path on this site.
  const everything = [...kept.map(([input]) => input), ...refused.map(([, input]) => input)];
  check(
    "no input, kept or refused, ever produces something that is not a single-slash path",
    everything.every((input) => {
      const out = safeNextPath(input);
      return out === null || (out.startsWith("/") && !out.startsWith("//") && !out.includes("\\"));
    })
  );

  eq(
    "a sign-in link carries a safe destination, encoded",
    authHref("login", "/courses/intro/learn?lesson=1"),
    "/auth/login?next=%2Fcourses%2Fintro%2Flearn%3Flesson%3D1"
  );
  eq("…and silently drops an unsafe one", authHref("register", "//evil.test"), "/auth/register");
  eq("…or a missing one", [authHref("login", null), authHref("login")], ["/auth/login", "/auth/login"]);

  // A learner page that finds the session has ended sends the learner here.
  eq(
    "a learner whose session ended is sent to sign in carrying the page they were on",
    sessionEndedHref("/courses/intro/learn?lesson=1"),
    "/auth/login?next=%2Fcourses%2Fintro%2Flearn%3Flesson%3D1&session=ended"
  );
  eq(
    "…with an unsafe or missing page dropped, and the marker kept",
    [sessionEndedHref("//evil.test"), sessionEndedHref("/admin/dashboard"), sessionEndedHref(null), sessionEndedHref()],
    Array(4).fill("/auth/login?session=ended")
  );
  eq(
    "…and what it carries is exactly what the sign-in page will accept",
    safeNextPath(new URL(sessionEndedHref("/grades?term=2"), "http://x.invalid").searchParams.get("next")),
    "/grades?term=2"
  );

  /* ---- Codes people type ---- */

  eq(
    "a typed code is tidied: case, spaces and hyphens are forgiven",
    [normalizeReferralCode(" ada-7k3m "), normalizeReferralCode("AD A7 K3M"), normalizeReferralCode("ada7k3m")],
    ["ADA7K3M", "ADA7K3M", "ADA7K3M"]
  );
  eq(
    "things that cannot be a code are not one",
    [
      normalizeReferralCode("abc"),
      normalizeReferralCode("A".repeat(17)),
      normalizeReferralCode("ADA_7K3"),
      normalizeReferralCode("<script>"),
      normalizeReferralCode("ADA7K3M'; DROP TABLE"),
      normalizeReferralCode(""),
      normalizeReferralCode(null),
      normalizeReferralCode(1234567),
      normalizeReferralCode("x".repeat(5000)),
    ],
    [null, null, null, null, null, null, null, null, null]
  );

  const sample = Array.from({ length: 300 }, () => generateReferralCode("Ada"));
  check(
    "a generated code is 7 characters from the unambiguous alphabet",
    sample.every((code) => code.length === 7 && [...code].every((ch) => CODE_ALPHABET.includes(ch))),
    sample.find((code) => code.length !== 7 || ![...code].some((ch) => CODE_ALPHABET.includes(ch)))
  );
  check(
    "…with none of I, L, O, 0 or 1",
    sample.every((code) => !/[ILO01]/.test(code))
  );
  check("…starting with the staff member's name", sample.every((code) => code.startsWith("ADA")));
  check("…and a tail random enough not to repeat", new Set(sample).size >= 295, `${new Set(sample).size} distinct of 300`);
  check(
    "every generated code survives being typed back in",
    sample.every((code) => normalizeReferralCode(code.toLowerCase()) === code)
  );
  eq(
    "name letters that could be misread are skipped, not kept",
    [generateReferralCode("Olivia").slice(0, 2), generateReferralCode("Li").length, generateReferralCode(null).length],
    ["VA", 7, 7]
  );
  check(
    "a name in another script still yields a valid code",
    normalizeReferralCode(generateReferralCode("Чинеду")) !== null
  );

  eq(
    "a code is added to a link without disturbing the rest of it",
    [
      withReferralCode("https://a.test/courses/x", "ADA7K3M"),
      withReferralCode("/courses?q=budget", "ada7k3m"),
      withReferralCode("/courses/x?ref=OLD1234&lesson=2#top", "ADA7K3M"),
      withReferralCode("/courses/x", null),
      withReferralCode("/courses/x", "not a code!"),
    ],
    [
      "https://a.test/courses/x?ref=ADA7K3M",
      "/courses?q=budget&ref=ADA7K3M",
      "/courses/x?ref=ADA7K3M&lesson=2#top",
      "/courses/x",
      "/courses/x",
    ]
  );
}

/* -------------------------------------------------------------------------- */
/* Attribution, against the database                                           */
/* -------------------------------------------------------------------------- */

async function databaseChecks() {
  const { prisma } = await import("../lib/db/client");
  const { runWithContext } = await import("../lib/db/tenant-context");
  const { ensureReferralCode, getReferralCode } = await import("../lib/referrals/codes");
  const { recordSignupReferral, recordEnrollmentReferral, recordPurchaseReferral } = await import(
    "../lib/referrals/attribution"
  );
  const { referralTotals, referredLearners } = await import("../lib/referrals/stats");

  try {
    const tenant = await prisma.tenant.findFirst({ where: { slug: tenantSlug }, select: { id: true, slug: true } });
    if (!tenant) throw new Error(`No "${tenantSlug}" academy to run against.`);
    const t = tenant.id;
    console.log(`\nAcademy: ${tenant.slug} (${t})\n`);

    await runWithContext({ mode: "tenant-admin", tenantId: t }, async () => {
      const stamp = Date.now().toString(36);
      const staffEmail = `verify-referrals-staff-${stamp}@example.test`;
      const otherStaffEmail = `verify-referrals-other-${stamp}@example.test`;
      const createdStaff: string[] = [];
      const createdClients: string[] = [];

      // A password hash nothing can match: these accounts cannot be signed in to.
      const unusable = `!verify-${stamp}`;
      const newStaff = async (email: string, firstName: string) => {
        const row = await prisma.tenantUser.create({
          data: { tenantId: t, email, passwordHash: unusable, firstName, lastName: "Verification", status: "ACTIVE" },
          select: { id: true },
        });
        createdStaff.push(row.id);
        return row.id;
      };
      const newClient = async (email: string) => {
        const row = await prisma.client.create({
          data: { tenantId: t, email, firstName: "Verify", lastName: "Learner" },
          select: { id: true },
        });
        createdClients.push(row.id);
        return row.id;
      };
      const events = (clientId: string) =>
        prisma.referralEvent.findMany({
          where: { tenantId: t, clientId },
          orderBy: { createdAt: "asc" },
          select: { type: true, reference: true, referralCodeId: true, amountCents: true, currency: true },
        });
      const referrerOf = async (clientId: string) =>
        (await prisma.client.findUnique({ where: { id: clientId }, select: { referralCodeId: true, referredAt: true } }))!;

      try {
        const staffId = await newStaff(staffEmail, "Grace");
        const otherStaffId = await newStaff(otherStaffEmail, "Tunde");

        /* ---- Codes ---- */

        eq("a staff member has no code until they ask for one", await getReferralCode(t, staffId), null);
        const code = await ensureReferralCode(t, staffId);
        check("asking creates one, named after them", /^GRA[A-Z2-9]{4}$/.test(code.code), code.code);
        eq("asking again returns the same code", (await ensureReferralCode(t, staffId)).code, code.code);
        const raced = await Promise.all([ensureReferralCode(t, otherStaffId), ensureReferralCode(t, otherStaffId)]);
        eq("two requests at once still produce one code", raced[0].code, raced[1].code);
        const otherCode = raced[0];
        eq(
          "…and one row",
          await prisma.referralCode.count({ where: { tenantId: t, tenantUserId: otherStaffId } }),
          1
        );

        /* ---- Signing up ---- */

        const learner = await newClient(`verify-referrals-learner-${stamp}@example.test`);
        const first = await recordSignupReferral({ tenantId: t, clientId: learner, code: code.code.toLowerCase() });
        eq("a sign-up through a code is credited to it", first, { recorded: true, code: code.code });
        eq("…and the learner remembers who referred them", (await referrerOf(learner)).referralCodeId, code.id);
        check("…and when", (await referrerOf(learner)).referredAt instanceof Date);

        const again = await recordSignupReferral({ tenantId: t, clientId: learner, code: code.code });
        eq("recording the same sign-up again counts nothing new", again.recorded, false);
        const poached = await recordSignupReferral({ tenantId: t, clientId: learner, code: otherCode.code });
        eq("a second code cannot take over a learner who was already referred", [
          poached.recorded,
          (await referrerOf(learner)).referralCodeId,
          (await events(learner)).length,
        ], [false, code.id, 1]);

        const cookieLearner = await newClient(`verify-referrals-cookie-${stamp}@example.test`);
        eq(
          "with no code typed, the visitor's cookie is used",
          await recordSignupReferral({ tenantId: t, clientId: cookieLearner, cookieCode: otherCode.code }),
          { recorded: true, code: otherCode.code }
        );

        const typedLearner = await newClient(`verify-referrals-typed-${stamp}@example.test`);
        eq(
          "a typed code beats the cookie",
          (await recordSignupReferral({ tenantId: t, clientId: typedLearner, code: code.code, cookieCode: otherCode.code })).code,
          code.code
        );

        const fallbackLearner = await newClient(`verify-referrals-fallback-${stamp}@example.test`);
        eq(
          "a typed code that does not exist falls through to the cookie",
          (await recordSignupReferral({ tenantId: t, clientId: fallbackLearner, code: "ZZZZ9999", cookieCode: code.code })).code,
          code.code
        );

        /* ---- Codes that must be ignored ---- */

        const stranger = await newClient(`verify-referrals-stranger-${stamp}@example.test`);
        eq(
          "an unknown code is ignored, silently",
          await recordSignupReferral({ tenantId: t, clientId: stranger, code: "ZZZZ9999" }),
          { recorded: false, code: null }
        );
        eq(
          "a malformed code is ignored, silently",
          await recordSignupReferral({ tenantId: t, clientId: stranger, code: "'; DROP TABLE--" }),
          { recorded: false, code: null }
        );
        eq("no code at all records nothing", await recordSignupReferral({ tenantId: t, clientId: stranger }), {
          recorded: false,
          code: null,
        });
        eq("…and leaves the learner with no referrer", (await referrerOf(stranger)).referralCodeId, null);
        eq(
          "a learner that does not exist records nothing and throws nothing",
          await recordSignupReferral({ tenantId: t, clientId: "no-such-client", code: code.code }),
          { recorded: false, code: null }
        );

        // Staff signing themselves up as a learner through their own link.
        const self = await newClient(staffEmail.toUpperCase());
        eq(
          "a staff member cannot refer themselves",
          await recordSignupReferral({ tenantId: t, clientId: self, code: code.code }),
          { recorded: false, code: null }
        );
        eq(
          "…but another staff member's code does credit that account",
          (await recordSignupReferral({ tenantId: t, clientId: self, code: otherCode.code })).recorded,
          true
        );

        await prisma.referralCode.update({ where: { id: otherCode.id }, data: { active: false } });
        const late = await newClient(`verify-referrals-late-${stamp}@example.test`);
        eq(
          "a code that has been switched off earns nothing new",
          await recordSignupReferral({ tenantId: t, clientId: late, code: otherCode.code }),
          { recorded: false, code: null }
        );
        eq(
          "…including from learners it referred while it was on",
          await recordEnrollmentReferral({ tenantId: t, clientId: cookieLearner, enrollmentId: `verify-enr-off-${stamp}` }),
          { recorded: false, code: null }
        );
        await prisma.referralCode.update({ where: { id: otherCode.id }, data: { active: true } });

        /* ---- Enrolling and paying ---- */

        const enrollmentId = `verify-enr-${stamp}`;
        eq(
          "an enrolment with no cookie is credited to the learner's sign-up referrer",
          await recordEnrollmentReferral({ tenantId: t, clientId: learner, enrollmentId, courseId: null }),
          { recorded: true, code: code.code }
        );
        eq(
          "the same enrolment recorded twice counts once",
          (await recordEnrollmentReferral({ tenantId: t, clientId: learner, enrollmentId })).recorded,
          false
        );
        eq(
          "a learner nobody referred, arriving through a link, credits that link",
          await recordEnrollmentReferral({
            tenantId: t,
            clientId: stranger,
            enrollmentId: `verify-enr-stranger-${stamp}`,
            cookieCode: code.code,
          }),
          { recorded: true, code: code.code }
        );
        eq("…without becoming their sign-up referrer", (await referrerOf(stranger)).referralCodeId, null);
        eq(
          "a learner nobody referred, with no link, records nothing",
          await recordEnrollmentReferral({ tenantId: t, clientId: late, enrollmentId: `verify-enr-late-${stamp}` }),
          { recorded: false, code: null }
        );

        const reference = `verify-pay-${stamp}`;
        const purchase = { tenantId: t, clientId: learner, reference, amountCents: 500_000, currency: "NGN" };
        eq("a confirmed payment is credited", await recordPurchaseReferral(purchase), { recorded: true, code: code.code });
        // The redirect-back verifier and the webhook both report the same payment.
        const replays = await Promise.all([recordPurchaseReferral(purchase), recordPurchaseReferral(purchase)]);
        eq("a replayed payment is counted once", replays.map((r) => r.recorded), [false, false]);
        eq(
          "a code carried with the payment beats the sign-up referrer",
          (await recordPurchaseReferral({ ...purchase, reference: `${reference}-b`, amountCents: 250_050, code: otherCode.code })).code,
          otherCode.code
        );
        eq(
          "a payment with no reference is not recorded",
          await recordPurchaseReferral({ ...purchase, reference: "" }),
          { recorded: false, code: null }
        );

        eq(
          "the learner's events are exactly: one sign-up, one enrolment, two purchases",
          (await events(learner)).map((e) => [e.type, e.amountCents, e.currency]),
          [
            ["SIGNUP", null, null],
            ["ENROLLMENT", null, null],
            ["PURCHASE", 500_000, "NGN"],
            ["PURCHASE", 250_050, "NGN"],
          ]
        );

        /* ---- What the Referrals page shows ---- */

        const totals = await referralTotals(t, [code.id, otherCode.id, "no-such-code"]);
        eq("totals for the first code", totals.get(code.id), {
          signups: 3, // learner, typed, fallback
          enrollments: 2, // learner, stranger
          purchases: 1,
          revenue: [{ currency: "NGN", amountCents: 500_000 }],
        });
        eq("totals for the second code", totals.get(otherCode.id), {
          signups: 2, // cookie learner, the staff member's own learner account
          enrollments: 0,
          purchases: 1,
          revenue: [{ currency: "NGN", amountCents: 250_050 }],
        });
        eq("a code with nothing recorded reads as zeros, not as missing", totals.get("no-such-code"), {
          signups: 0,
          enrollments: 0,
          purchases: 0,
          revenue: [],
        });

        const referred = await referredLearners(t, code.id);
        eq(
          "the referred-learners list holds the learners who signed up through the code",
          referred.map((r) => r.id).sort(),
          [learner, typedLearner, fallbackLearner].sort()
        );
        eq(
          "…with what each went on to do",
          referred.filter((r) => r.id === learner).map((r) => [r.enrollments, r.purchases]),
          [[1, 1]]
        );

        /* ---- A staff member who leaves ---- */

        await prisma.tenantUser.update({ where: { id: staffId }, data: { status: "SUSPENDED" } });
        eq(
          "a code whose owner can no longer sign in earns nothing",
          await recordEnrollmentReferral({ tenantId: t, clientId: learner, enrollmentId: `verify-enr-left-${stamp}` }),
          { recorded: false, code: null }
        );
      } finally {
        // Events and codes cascade from the learners and staff they belong to.
        if (createdClients.length) await prisma.client.deleteMany({ where: { tenantId: t, id: { in: createdClients } } });
        if (createdStaff.length) await prisma.tenantUser.deleteMany({ where: { tenantId: t, id: { in: createdStaff } } });
        const left = await prisma.referralEvent.count({ where: { tenantId: t, clientId: { in: createdClients } } });
        const leftCodes = await prisma.referralCode.count({ where: { tenantId: t, tenantUserId: { in: createdStaff } } });
        console.log(
          `\nCleaned up ${createdClients.length} learners and ${createdStaff.length} staff` +
            ` (${left} events and ${leftCodes} codes left behind).`
        );
        if (left !== 0 || leftCodes !== 0) failed++;
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  pureChecks();
  if (skipDb) {
    console.log("\n(skipped the database checks — run without --no-db to include them)");
  } else {
    await databaseChecks();
  }
  console.log(failed === 0 ? `\nAll ${total} checks passed.` : `\n${failed} of ${total} check(s) FAILED.`);
}

main()
  .catch((e) => {
    console.error("\nVerification crashed:", e);
    failed++;
  })
  .finally(() => process.exit(failed === 0 ? 0 : 1));

/**
 * End-to-end lifecycle over HTTP: platform → academy → learner, on a LOCAL server.
 *
 *   E2E_MAIL_DIR=<folder the test mail catcher writes to> npm run e2e:lifecycle
 *
 * What it needs
 *   - the dev server running (default 127.0.0.1:3010; override with E2E_PORT);
 *   - PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD in .env for that server's
 *     database;
 *   - a mail catcher on the SMTP port the server uses, writing each message to
 *     `<E2E_MAIL_DIR>/NNN.eml` and one line per message to `index.log`
 *     (`NNN<TAB>iso time<TAB>recipient<TAB>subject`). Temporary passwords,
 *     one-time codes and reset links are read from there.
 *
 * What it does
 *   Creates a throwaway academy (slug `e2e<stamp>`), an owner, a second staff
 *   member, a course with a lesson and a quiz, a referral code, a site page, a
 *   certificate and one learner; walks the learner from a shared link through
 *   registration, enrolment, the lesson, a failed and a passed quiz attempt, to
 *   the certificate; then checks the academy from the staff and platform side.
 *   The academy is left in place, SUSPENDED, and its slug is printed.
 *
 * It only ever talks to 127.0.0.1 and refuses any other target. No secret
 * (password, code, token) is printed.
 */
import "dotenv/config";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.E2E_PORT ?? 3010);
const TARGET = "127.0.0.1";
const BASE_DOMAIN = "localhost";
const PLATFORM_SUBDOMAIN = process.env.PLATFORM_SUBDOMAIN ?? "platform";
const MAIL_DIR = process.env.E2E_MAIL_DIR ?? "";
const REQUEST_TIMEOUT_MS = 240_000;

/* -------------------------------------------------------------------------- */
/* Reporting                                                                   */
/* -------------------------------------------------------------------------- */

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail?: string): boolean {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

/** A missing prerequisite: nothing after it in the same phase can be judged. */
class Abort extends Error {}

function need<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined || value === "") {
    throw new Abort(`cannot continue without ${what}`);
  }
  return value;
}

function section(title: string): void {
  console.log(`\n# ${title}`);
}

/* -------------------------------------------------------------------------- */
/* HTTP                                                                        */
/* -------------------------------------------------------------------------- */

type Envelope<T> = { data: T | null; error: { code: string; message: string } | null };

type Res = {
  status: number;
  location: string | null;
  text: string;
  /** The `data` of a JSON envelope, or null. */
  data<T>(): T | null;
  /** The error code of a JSON envelope, or null. */
  errorCode(): string | null;
};

class Actor {
  private jar = new Map<string, string>();

  constructor(
    readonly label: string,
    readonly host: string
  ) {}

  hasCookie(name: string): boolean {
    return this.jar.has(name);
  }

  setCookie(name: string, value: string): void {
    this.jar.set(name, value);
  }

  private absorb(setCookie: string[] | undefined): void {
    for (const line of setCookie ?? []) {
      const first = line.split(";")[0];
      const eq = first.indexOf("=");
      if (eq < 1) continue;
      const name = first.slice(0, eq).trim();
      const value = first.slice(eq + 1).trim();
      const maxAge = /;\s*max-age=(-?\d+)/i.exec(line);
      const expires = /;\s*expires=([^;]+)/i.exec(line);
      const gone =
        value === "" ||
        (maxAge !== null && Number(maxAge[1]) <= 0) ||
        (expires !== null && new Date(expires[1]).getTime() < Date.now());
      if (gone) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    return new Promise<Res>((resolve, reject) => {
      const req = http.request(
        {
          host: TARGET,
          port: PORT,
          method,
          path,
          headers: {
            host: `${this.host}:${PORT}`,
            accept: "text/html,application/json",
            "user-agent": "lms-e2e-lifecycle",
            ...(cookie ? { cookie } : {}),
            ...(payload ? { "content-type": "application/json", "content-length": String(payload.length) } : {}),
            ...headers,
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            this.absorb(res.headers["set-cookie"]);
            const text = Buffer.concat(chunks).toString("utf8");
            const parse = (): Envelope<unknown> | null => {
              try {
                return JSON.parse(text) as Envelope<unknown>;
              } catch {
                return null;
              }
            };
            const loc = res.headers.location;
            resolve({
              status: res.statusCode ?? 0,
              location: typeof loc === "string" ? loc : null,
              text,
              data: <T>() => (parse()?.data ?? null) as T | null,
              errorCode: () => parse()?.error?.code ?? null,
            });
          });
          res.on("error", reject);
        }
      );
      req.on("timeout", () => req.destroy(new Error(`timed out: ${method} ${this.host}${path}`)));
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  get(path: string): Promise<Res> {
    return this.request("GET", path);
  }

  private async csrf(): Promise<string> {
    if (!this.jar.has("mt-csrf")) await this.get("/api/auth/csrf");
    return this.jar.get("mt-csrf") ?? "";
  }

  async send(method: "POST" | "PATCH" | "PUT" | "DELETE", path: string, body: unknown = {}, headers: Record<string, string> = {}): Promise<Res> {
    return this.request(method, path, body, { "x-csrf-token": await this.csrf(), ...headers });
  }

  post(path: string, body: unknown = {}, headers: Record<string, string> = {}): Promise<Res> {
    return this.send("POST", path, body, headers);
  }

  patch(path: string, body: unknown = {}): Promise<Res> {
    return this.send("PATCH", path, body);
  }

  /**
   * GET, following redirects that stay on this host — both kinds. A page under
   * a `loading.tsx` has already answered 200 by the time its guard redirects,
   * so the redirect arrives inside the stream and the browser follows it from
   * there; `streamed` says that is how at least one hop was made.
   */
  async open(path: string): Promise<{ res: Res; finalPath: string; streamed: boolean }> {
    let current = path;
    let streamed = false;
    let res = await this.get(current);
    for (let hop = 0; hop < 6; hop += 1) {
      const inStream = res.status === 200 ? streamedRedirect(res.text) : null;
      const target = res.status >= 300 && res.status < 400 ? res.location : inStream;
      if (!target) break;
      const next = new URL(target, `http://${this.host}:${PORT}`);
      if (next.hostname !== this.host) break;
      if (inStream) streamed = true;
      current = `${next.pathname}${next.search}`;
      res = await this.get(current);
    }
    return { res, finalPath: current, streamed };
  }
}

/** Where a streamed page says to go instead, if it does. */
function streamedRedirect(text: string): string | null {
  const digest = /NEXT_REDIRECT;(?:replace|push);([^;"\\]+);/.exec(text);
  if (digest) return digest[1];
  const meta = /<meta[^>]+http-equiv="refresh"[^>]+content="[^"]*url=([^"]+)"/i.exec(text);
  return meta ? meta[1].replace(/&amp;/g, "&") : null;
}

const ERROR_MARKER = /id="__next_error__"|Application error: a (?:server|client)-side exception/;

/** A page that rendered: 200, at the address asked for, no error screen, and (optionally) showing `marker`. */
async function page(actor: Actor, path: string, marker?: string): Promise<boolean> {
  const { res, finalPath } = await actor.open(path);
  const asked = path.split("?")[0];
  const landed = finalPath.split("?")[0];
  const problems: string[] = [];
  if (res.status !== 200) problems.push(`status ${res.status}`);
  if (landed !== asked) problems.push(`ended at ${landed}`);
  if (ERROR_MARKER.test(res.text)) problems.push("error screen");
  if (res.status === 200 && streamedRedirect(res.text)) problems.push(`redirects on to ${streamedRedirect(res.text)}`);
  if (marker && !res.text.includes(marker)) problems.push(`"${marker}" not on the page`);
  return check(`${actor.label}: page ${asked}${marker ? ` shows "${marker}"` : ""}`, problems.length === 0, problems.join(", "));
}

/* -------------------------------------------------------------------------- */
/* Mail                                                                        */
/* -------------------------------------------------------------------------- */

type MailLine = { id: string; to: string; subject: string };

function mailIndex(): MailLine[] {
  const file = join(MAIL_DIR, "index.log");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [id, , to, subject] = line.split("\t");
      return { id, to: (to ?? "").toLowerCase(), subject: subject ?? "" };
    });
}

function decodePart(part: string): string {
  const cut = /\r?\n\r?\n/.exec(part);
  if (!cut) return part;
  const head = part.slice(0, cut.index);
  const body = part.slice(cut.index + cut[0].length);
  const encoding = /content-transfer-encoding:\s*([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  if (encoding === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (encoding === "quoted-printable") {
    const joined = body.replace(/=\r?\n/g, "");
    const binary = joined.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return Buffer.from(binary, "latin1").toString("utf8");
  }
  return body;
}

function decodeMail(raw: string): string {
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(raw)?.[1];
  if (!boundary) return decodePart(raw);
  return raw
    .split(`--${boundary}`)
    .map(decodePart)
    .join("\n");
}

/** The first message to `to` that arrived after `since` messages, decoded; null after 40s. */
async function mailFor(to: string, since: number, subject?: RegExp): Promise<string | null> {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const hit = mailIndex()
      .slice(since)
      .find((m) => m.to.includes(to.toLowerCase()) && (!subject || subject.test(m.subject)));
    if (hit) {
      const file = join(MAIL_DIR, `${hit.id}.eml`);
      if (existsSync(file)) return decodeMail(readFileSync(file, "utf8"));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

const tempPasswordIn = (mail: string | null) => (mail ? (/Tmp![A-Za-z0-9_-]{10,}9A/.exec(mail)?.[0] ?? null) : null);
const codeIn = (mail: string | null) =>
  mail ? (/(?:>|\s)(\d{6})(?:\s*<\/p>|\s+This code expires)/.exec(mail)?.[1] ?? null) : null;
const resetTokenIn = (mail: string | null) =>
  mail ? (/\/auth\/reset-password\?token=([A-Za-z0-9_.~%-]+)/.exec(mail)?.[1] ?? null) : null;

/* -------------------------------------------------------------------------- */
/* The run                                                                     */
/* -------------------------------------------------------------------------- */

/** Meets the password policy: 12+ characters with lower, upper, digit and symbol. */
function newPassword(): string {
  return `E2e!${randomBytes(9).toString("base64url")}aZ7`;
}

const run = Date.now().toString(36).slice(-6);
const slug = `e2e${run}`;
const academyName = `E2E Academy ${run}`;
const courseSlug = `e2e-course-${run}`;
const courseTitle = `E2E Course ${run}`;
const quizTitle = `E2E Quiz ${run}`;
const certificateName = `E2E Certificate ${run}`;
const pageMarker = `e2e-page-${run}`;
const ownerEmail = `owner-${run}@e2e.test`;
const staffEmail = `staff-${run}@e2e.test`;
const learnerEmail = `learner-${run}@e2e.test`;
const learnerName = `Lerato Etoe${run}`;

const platform = new Actor("platform", `${PLATFORM_SUBDOMAIN}.${BASE_DOMAIN}`);
const admin = new Actor("admin", `${slug}.${BASE_DOMAIN}`);
const staff = new Actor("staff", `${slug}.${BASE_DOMAIN}`);
const visitor = new Actor("visitor", `${slug}.${BASE_DOMAIN}`);
const learner = new Actor("learner", `${slug}.${BASE_DOMAIN}`);

const state: {
  tenantId?: string;
  ownerPassword?: string;
  courseId?: string;
  lessonId?: string;
  lessonAnchor?: string;
  quizLessonId?: string;
  quizId?: string;
  choiceQuestionId?: string;
  shortQuestionId?: string;
  referralCode?: string;
  learnerPassword?: string;
} = {};

async function platformPhase(): Promise<void> {
  section("1. Platform");
  const email = need(process.env.PLATFORM_ADMIN_EMAIL, "PLATFORM_ADMIN_EMAIL in .env");
  const password = need(process.env.PLATFORM_ADMIN_PASSWORD, "PLATFORM_ADMIN_PASSWORD in .env");

  const login = await platform.post("/api/auth/login", { email, password });
  const loginData = login.data<{ mustChangePassword: boolean; redirect: string }>();
  if (login.status === 200 && loginData?.mustChangePassword) {
    // A freshly seeded platform admin has to choose a new password at first
    // sign-in. This test will not do that for you: it would leave .env out of
    // step with the account.
    check("platform: sign in", false, "this account must change its password at first sign-in; do that once, put the new password in .env, and run again");
    throw new Abort("platform admin has not completed its first sign-in");
  }
  if (!check("platform: sign in", login.status === 200 && loginData?.redirect === "/dashboard", `status ${login.status} ${login.errorCode() ?? ""}`)) {
    throw new Abort("platform sign-in failed");
  }
  await page(platform, "/dashboard");
  await page(platform, "/tenants");

  const plans = (await platform.get("/api/platform/plans")).data<{ plans: { id: string; code: string }[] }>();
  const starter = plans?.plans.find((p) => p.code === "starter") ?? plans?.plans.find((p) => p.code !== "trial");
  check("platform: plans are listed", Boolean(starter), "no paid plan found");

  const before = mailIndex().length;
  const create = await platform.post("/api/platform/tenants", {
    name: academyName,
    slug,
    ownerEmail,
    ownerFirstName: "Olu",
    ownerLastName: "Owner",
    companyEmail: `hello-${run}@e2e.test`,
    city: "Lagos",
    country: "NG",
  });
  const tenant = create.data<{ tenant: { id: string; slug: string; status: string } }>()?.tenant;
  check("platform: create academy", create.status === 200 && tenant?.slug === slug, `status ${create.status} ${create.errorCode() ?? ""}`);
  state.tenantId = need(tenant?.id, "the new academy");

  const invite = await mailFor(ownerEmail, before, /invited/i);
  state.ownerPassword = tempPasswordIn(invite) ?? undefined;
  check("platform: owner invitation email carries a temporary password", Boolean(state.ownerPassword), invite ? "no temporary password in the email" : "no email arrived");

  const list = (await platform.get("/api/platform/tenants")).data<{ slug: string }[]>();
  check("platform: academy is in the list", Boolean(list?.some((t) => t.slug === slug)));
  await page(platform, "/tenants", academyName);
  await page(platform, `/tenants/${state.tenantId}`, academyName);

  if (starter) {
    const plan = await platform.patch(`/api/platform/tenants/${state.tenantId}/plan`, { action: "activate_manual", planId: starter.id });
    const detail = (await platform.get(`/api/platform/tenants/${state.tenantId}`)).data<{
      tenant: { subscriptionPlan: { code: string } | null };
    }>();
    check("platform: change the academy's plan", plan.status === 200 && detail?.tenant.subscriptionPlan?.code === starter.code, `status ${plan.status} ${plan.errorCode() ?? ""}`);
  }

  const log = (await platform.get(`/api/platform/activity-logs?tenantId=${state.tenantId}&action=tenant.create`)).data<unknown[]>();
  check("platform: activity log records the creation", (log?.length ?? 0) >= 1);
  await page(platform, "/activity");
}

async function adminPhase(): Promise<void> {
  section("2. Academy admin");
  const tempPassword = need(state.ownerPassword, "the owner's temporary password");

  const login = await admin.post("/api/auth/login", { email: ownerEmail, password: tempPassword, surface: "tenant_admin" });
  const loginData = login.data<{ mustChangePassword: boolean }>();
  if (!check("admin: sign in with the temporary password", login.status === 200 && loginData?.mustChangePassword === true, `status ${login.status} ${login.errorCode() ?? ""}`)) {
    throw new Abort("owner sign-in failed");
  }

  const gated = await admin.open("/admin/dashboard");
  check("admin: dashboard insists on a password change first", gated.finalPath.startsWith("/admin/auth/change-password") && gated.res.status === 200, `ended at ${gated.finalPath} (${gated.res.status})`);

  const ownerPassword = newPassword();
  const change = await admin.post("/api/auth/change-password", { currentPassword: tempPassword, newPassword: ownerPassword });
  check("admin: change password", change.status === 200, `status ${change.status} ${change.errorCode() ?? ""}`);
  state.ownerPassword = ownerPassword;

  const toOnboarding = await admin.open("/admin/dashboard");
  check("admin: owner is sent to onboarding", toOnboarding.finalPath.startsWith("/admin/onboarding") && toOnboarding.res.status === 200, `ended at ${toOnboarding.finalPath} (${toOnboarding.res.status})`);

  const settings = await admin.patch("/api/tenant/settings", {
    companyPhone: "+234 801 000 0000",
    addressLine1: "1 Test Close",
    settings: {
      timezone: "Africa/Lagos",
      primaryColor: "#1d4ed8",
      onboarding: { completedAt: new Date().toISOString(), completedSteps: ["branding", "course", "payouts"] },
    },
  });
  check("admin: save settings and finish onboarding", settings.status === 200, `status ${settings.status} ${settings.errorCode() ?? ""}`);
  await page(admin, "/admin/dashboard");
  await page(admin, "/admin/settings");

  // A second member of staff.
  const roles = (await admin.get("/api/tenant/role-templates")).data<{ id: string; name: string }[]>();
  const role = roles?.find((r) => /instructor/i.test(r.name)) ?? roles?.find((r) => !/owner/i.test(r.name));
  if (check("admin: role templates exist", Boolean(role))) {
    const before = mailIndex().length;
    const invite = await admin.post("/api/tenant/users", { email: staffEmail, firstName: "Sade", lastName: "Staff", roleTemplateId: role!.id });
    check(`admin: invite staff as ${role!.name}`, invite.status === 200, `status ${invite.status} ${invite.errorCode() ?? ""}`);
    const staffTemp = tempPasswordIn(await mailFor(staffEmail, before, /invited/i));
    if (check("admin: staff invitation email carries a temporary password", Boolean(staffTemp))) {
      const staffLogin = await staff.post("/api/auth/login", { email: staffEmail, password: staffTemp, surface: "tenant_admin" });
      check("staff: sign in with the temporary password", staffLogin.status === 200, `status ${staffLogin.status} ${staffLogin.errorCode() ?? ""}`);
      const staffChange = await staff.post("/api/auth/change-password", { currentPassword: staffTemp, newPassword: newPassword() });
      check("staff: change password", staffChange.status === 200, `status ${staffChange.status} ${staffChange.errorCode() ?? ""}`);
      await page(staff, "/admin/dashboard");
    }
    await page(admin, "/admin/users", staffEmail);
  }

  // Course → module → lesson.
  const course = await admin.post("/api/tenant/courses", { title: courseTitle, slug: courseSlug, description: "Created by the lifecycle test." });
  state.courseId = need(course.data<{ course: { id: string } }>()?.course.id, "the course");
  check("admin: create course", course.status === 201);

  const group = await admin.post(`/api/tenant/courses/${state.courseId}/lesson-groups`, { title: "Module one" });
  const groupId = group.data<{ group: { id: string } }>()?.group.id;
  check("admin: create module", group.status === 201 && Boolean(groupId), `status ${group.status} ${group.errorCode() ?? ""}`);

  const lesson = await admin.post(`/api/tenant/courses/${state.courseId}/lessons`, {
    title: "Capital cities",
    contentType: "HTML",
    contentJson: {
      html: '<aside class="lesson-objectives"><h3>By the end of this lesson</h3><ul><li>Name the capital of France.</li></ul></aside><h2>France</h2><p>The capital of France is Paris.</p><h2>Counting</h2><p>Two plus two is four.</p>',
    },
    groupId,
    requireDwell: false,
  });
  const lessonRow = lesson.data<{ lesson: { id: string; contentJson: { html?: string } } }>()?.lesson;
  state.lessonId = need(lessonRow?.id, "the lesson");
  state.lessonAnchor = /<h2 id="(sec-[^"]+)"[^>]*>France/.exec(lessonRow?.contentJson.html ?? "")?.[1];
  check("admin: create HTML lesson (headings get anchors)", lesson.status === 201 && Boolean(state.lessonAnchor), `status ${lesson.status}, anchor ${state.lessonAnchor ?? "missing"}`);

  // Question bank → questions with a hint and a source.
  const bank = await admin.post("/api/tenant/question-banks", { name: `E2E Bank ${run}` });
  const bankId = need(bank.data<{ bank: { id: string } }>()?.bank.id, "the question bank");
  check("admin: create question bank", bank.status === 201);

  const choice = await admin.post(`/api/tenant/question-banks/${bankId}/questions`, {
    type: "SINGLE_CHOICE",
    prompt: "What is the capital of France?",
    options: ["Lyon", "Paris", "Nice"],
    answer: [1],
    hint: "It is on the Seine.",
  });
  state.choiceQuestionId = need(choice.data<{ question: { id: string } }>()?.question.id, "the choice question");
  const short = await admin.post(`/api/tenant/question-banks/${bankId}/questions`, {
    type: "SHORT_ANSWER",
    prompt: "What is two plus two? Answer with a word.",
    answer: ["four"],
    hint: "One more than three.",
  });
  state.shortQuestionId = need(short.data<{ question: { id: string } }>()?.question.id, "the short-answer question");
  check("admin: create a choice and a short-answer question with hints", choice.status === 201 && short.status === 201);

  const source = { lessonId: state.lessonId, anchor: state.lessonAnchor ?? null };
  const src1 = await admin.patch(`/api/tenant/questions/${state.choiceQuestionId}`, { source });
  const src2 = await admin.patch(`/api/tenant/questions/${state.shortQuestionId}`, { source: { lessonId: state.lessonId } });
  check("admin: point both questions at the lesson", src1.status === 200 && src2.status === 200, `statuses ${src1.status}/${src2.status} ${src1.errorCode() ?? src2.errorCode() ?? ""}`);

  // Quiz.
  const quiz = await admin.post("/api/tenant/quizzes", { title: quizTitle, passingScore: 60, hintsEnabled: true, showReviewLinks: true });
  state.quizId = need(quiz.data<{ quiz: { id: string } }>()?.quiz.id, "the quiz");
  const attach = await admin.post(`/api/tenant/quizzes/${state.quizId}/questions`, {
    questions: [{ questionId: state.choiceQuestionId }, { questionId: state.shortQuestionId }],
  });
  check("admin: create quiz (pass mark 60, hints and review links on) with both questions", quiz.status === 201 && attach.data<{ count: number }>()?.count === 2, `statuses ${quiz.status}/${attach.status}`);

  const quizLesson = await admin.post(`/api/tenant/courses/${state.courseId}/lessons`, {
    title: "Check your understanding",
    contentType: "QUIZ",
    contentJson: { quizId: state.quizId },
    groupId,
  });
  state.quizLessonId = quizLesson.data<{ lesson: { id: string } }>()?.lesson.id;
  check("admin: attach the quiz to the course", quizLesson.status === 201 && Boolean(state.quizLessonId), `status ${quizLesson.status} ${quizLesson.errorCode() ?? ""}`);

  const publish = await admin.patch(`/api/tenant/courses/${state.courseId}`, { status: "PUBLISHED", visibility: "PUBLIC" });
  check("admin: publish the course", publish.data<{ course: { status: string } }>()?.course.status === "PUBLISHED", `status ${publish.status} ${publish.errorCode() ?? ""}`);

  // Referral code, site page, certificate.
  const referral = await admin.post("/api/tenant/referrals");
  state.referralCode = referral.data<{ code: string }>()?.code;
  check("admin: create referral code", (referral.status === 201 || referral.status === 200) && Boolean(state.referralCode), `status ${referral.status} ${referral.errorCode() ?? ""}`);

  const sitePage = await admin.post("/api/tenant/site/pages", {
    title: `About ${run}`,
    slug: `about-${run}`,
    status: "PUBLISHED",
    htmlSource: `<section style="padding:3rem 1.5rem"><h1>About {{ tenant.name }}</h1><p>${pageMarker}</p></section>`,
  });
  check("admin: publish a site page", sitePage.status === 201, `status ${sitePage.status} ${sitePage.errorCode() ?? ""}`);

  const certificate = await admin.post("/api/tenant/certificates", { name: certificateName, courseId: state.courseId });
  check("admin: create a certificate for the course", certificate.status === 201, `status ${certificate.status} ${certificate.errorCode() ?? ""}`);

  await page(admin, "/admin/courses", courseTitle);
  await page(admin, `/admin/courses/${state.courseId}`, courseTitle);
  await page(admin, "/admin/quizzes", quizTitle);
  await page(admin, `/admin/quizzes/${state.quizId}`, quizTitle);
  await page(admin, "/admin/site/pages", `About ${run}`);
  await page(admin, "/admin/referrals", state.referralCode);
  await page(admin, "/admin/billing");
  await page(admin, "/admin/certificates", certificateName);
}

async function learnerPhase(): Promise<void> {
  section("3. Learner");
  const quizId = need(state.quizId, "the quiz");
  const lessonId = need(state.lessonId, "the lesson");
  const quizLessonId = need(state.quizLessonId, "the quiz lesson");

  // A visitor follows a shared link.
  const shared = `/courses/${courseSlug}${state.referralCode ? `?ref=${state.referralCode}` : ""}`;
  const publicCourse = await visitor.get(shared);
  check("visitor: public course page renders", publicCourse.status === 200 && publicCourse.text.includes(courseTitle) && !ERROR_MARKER.test(publicCourse.text), `status ${publicCourse.status}`);
  check("visitor: the referral code is remembered", !state.referralCode || visitor.hasCookie("__mt-ref"));
  const about = await visitor.get(`/about-${run}`);
  check("visitor: published site page renders with its variable filled in", about.status === 200 && about.text.includes(pageMarker) && about.text.includes(`About ${academyName}`), `status ${about.status}`);
  const home = await visitor.get("/");
  check("visitor: academy home page renders", home.status === 200 && !ERROR_MARKER.test(home.text), `status ${home.status}`);
  const register = await visitor.get("/auth/register");
  check("visitor: register page renders", register.status === 200 && !ERROR_MARKER.test(register.text), `status ${register.status}`);

  // Register (the visitor's cookies — including the referral — carry over).
  const password = newPassword();
  state.learnerPassword = password;
  const before = mailIndex().length;
  const weak = await visitor.post("/api/auth/register/client/start", { email: learnerEmail, password: "short", confirm: "short", displayName: learnerName });
  check("visitor: a weak password is refused", weak.status === 400, `status ${weak.status}`);
  const start = await visitor.post("/api/auth/register/client/start", {
    email: learnerEmail,
    password,
    confirm: password,
    displayName: learnerName,
    firstName: "Lerato",
    lastName: `Etoe${run}`,
  });
  check("visitor: start registration", start.status === 200 && start.data<{ step: string }>()?.step === "otp", `status ${start.status} ${start.errorCode() ?? ""}`);
  const code = codeIn(await mailFor(learnerEmail, before, /code|verify/i));
  check("visitor: verification email carries a six-digit code", Boolean(code));

  const wrongCode = await visitor.post("/api/auth/register/client/complete", { email: learnerEmail, code: code === "000000" ? "111111" : "000000" });
  check("visitor: a wrong code is refused", wrongCode.status === 401, `status ${wrongCode.status}`);
  const complete = await visitor.post("/api/auth/register/client/complete", { email: learnerEmail, code: need(code, "the verification code") });
  if (!check("visitor: finish registration (signed in)", complete.status === 200 && visitor.hasCookie("__mt-client-session"), `status ${complete.status} ${complete.errorCode() ?? ""}`)) {
    throw new Abort("registration failed");
  }
  const signOutFirst = await visitor.post("/api/auth/logout");
  check("visitor: sign out after registering", signOutFirst.status === 200 && !visitor.hasCookie("__mt-client-session"), `status ${signOutFirst.status}`);

  // Sign in.
  const bad = await learner.post("/api/auth/login", { email: learnerEmail, password: `${password}x`, surface: "tenant_client" });
  check("learner: a wrong password is refused", bad.status === 401, `status ${bad.status}`);
  const login = await learner.post("/api/auth/login", { email: learnerEmail, password, surface: "tenant_client", next: `/courses/${courseSlug}` });
  check("learner: sign in (and return to the page asked for)", login.status === 200 && login.data<{ redirect: string }>()?.redirect === `/courses/${courseSlug}`, `status ${login.status} ${login.errorCode() ?? ""}`);
  await page(learner, "/dashboard");

  // Profile.
  const basics = await learner.patch("/api/client/profile", {
    section: "basics",
    value: { displayName: learnerName, firstName: "Lerato", lastName: `Etoe${run}`, phone: "+234 801 234 5678", headline: "Tester", bio: "Created by the lifecycle test.", location: "Lagos" },
  });
  const skills = await learner.patch("/api/client/profile", { section: "skills", value: [{ name: "Testing", level: "advanced" }] });
  check("learner: update profile (basics and skills)", basics.status === 200 && skills.status === 200, `statuses ${basics.status}/${skills.status} ${basics.errorCode() ?? skills.errorCode() ?? ""}`);
  await page(learner, "/profile", "Tester");

  // Catalog and enrolment.
  const catalog = (await learner.get("/api/client/courses")).data<{ slug: string }[] | { courses: { slug: string }[] }>();
  const catalogRows = Array.isArray(catalog) ? catalog : (catalog?.courses ?? []);
  check("learner: catalog lists the course", catalogRows.some((c) => c.slug === courseSlug));
  await page(learner, "/courses", courseTitle);

  const notEnrolled = await learner.get(`/api/client/courses/${courseSlug}/learn`);
  check("learner: lessons are closed before enrolling", notEnrolled.status === 403, `status ${notEnrolled.status}`);
  const enrol = await learner.post(`/api/client/courses/${courseSlug}`);
  check("learner: enrol in the free course", enrol.status === 201 && Boolean(enrol.data<{ enrollment: { id: string } }>()?.enrollment.id), `status ${enrol.status} ${enrol.errorCode() ?? ""}`);

  // The lesson.
  type LearnLesson = { id: string; locked: boolean; completed: boolean; rendered: { html: string } | null; outline: unknown[] };
  const learn = (await learner.get(`/api/client/courses/${courseSlug}/learn`)).data<{ lessons: LearnLesson[] }>();
  const first = learn?.lessons.find((l) => l.id === lessonId);
  const second = learn?.lessons.find((l) => l.id === quizLessonId);
  check("learner: the lesson is delivered rendered, with its outline", Boolean(first?.rendered?.html.includes("Paris")) && (first?.outline.length ?? 0) >= 2);
  check("learner: the quiz lesson is locked until the lesson is done", second?.locked === true);
  // The player loads its lessons in the browser, so only the page itself is judged here.
  await page(learner, `/courses/${courseSlug}/learn`);

  const early = await learner.post(`/api/client/courses/${courseSlug}/learn`, { lessonId, action: "complete" });
  check("learner: a lesson cannot be completed before it is opened", early.status === 409, `status ${early.status} ${early.errorCode() ?? ""}`);
  const open = await learner.post(`/api/client/courses/${courseSlug}/learn`, { lessonId, action: "open" });
  check("learner: open the lesson", open.status === 200 && Boolean(open.data<{ startedAt: string | null }>()?.startedAt), `status ${open.status} ${open.errorCode() ?? ""}`);
  const done = await learner.post(`/api/client/courses/${courseSlug}/learn`, { lessonId, action: "complete" });
  check("learner: complete the lesson (50%)", done.status === 200 && done.data<{ enrollment: { progressPercent: number } }>()?.enrollment.progressPercent === 50, `status ${done.status} ${done.errorCode() ?? ""}`);

  // The quiz.
  type QuizView = { quiz: { passMark: number; questions: { id: string; hint: string | null }[] }; alreadyPassed: boolean };
  const view = (await learner.get(`/api/client/quizzes/${quizId}/attempt`)).data<QuizView>();
  check("learner: quiz opens with pass mark 60 and both hints", view?.quiz.passMark === 60 && view.quiz.questions.length === 2 && view.quiz.questions.every((q) => Boolean(q.hint)));

  const openQuiz = await learner.post(`/api/client/courses/${courseSlug}/learn`, { lessonId: quizLessonId, action: "open" });
  check("learner: open the quiz lesson", openQuiz.status === 200, `status ${openQuiz.status} ${openQuiz.errorCode() ?? ""}`);
  const gate = await learner.post(`/api/client/courses/${courseSlug}/learn`, { lessonId: quizLessonId, action: "complete" });
  check("learner: the quiz lesson cannot be completed before passing", gate.status === 409 && gate.errorCode() === "quiz_not_passed", `status ${gate.status} ${gate.errorCode() ?? ""}`);

  type AttemptPayload = {
    attempt: { passed: boolean | null; scorePercent: number | null; gradingStatus: string };
    results: Record<string, boolean> | null;
    incorrectCount: number;
    review: { questionId: string; source: { lessonId: string; anchor: string | null } | null }[] | null;
  };
  const wrong = await learner.post(`/api/client/quizzes/${quizId}/attempt`, {
    answers: { [need(state.choiceQuestionId, "question")]: [0], [need(state.shortQuestionId, "question")]: "five" },
  });
  const wrongData = wrong.data<AttemptPayload>();
  check("learner: wrong answers fail the quiz (0%)", wrong.status === 200 && wrongData?.attempt.passed === false && wrongData.attempt.scorePercent === 0, `status ${wrong.status} ${wrong.errorCode() ?? ""}`);
  check("learner: a failed attempt gives no answer key", wrongData?.results === null && wrongData.incorrectCount === 2);
  const reviewed = wrongData?.review ?? [];
  check(
    "learner: the failed attempt lists both questions with read-up links to the lesson",
    reviewed.length === 2 && reviewed.every((r) => r.source?.lessonId === lessonId) && reviewed.some((r) => r.source?.anchor === state.lessonAnchor),
    `review ${JSON.stringify(reviewed.map((r) => ({ lesson: r.source?.lessonId === lessonId, anchor: r.source?.anchor ?? null })))}`
  );

  const right = await learner.post(`/api/client/quizzes/${quizId}/attempt`, {
    answers: { [state.choiceQuestionId!]: [1], [state.shortQuestionId!]: " Four " },
  });
  const rightData = right.data<AttemptPayload>();
  check("learner: right answers pass the quiz (100%)", right.status === 200 && rightData?.attempt.passed === true && rightData.attempt.scorePercent === 100, `status ${right.status} ${right.errorCode() ?? ""}`);

  const finish = await learner.post(`/api/client/courses/${courseSlug}/learn`, { lessonId: quizLessonId, action: "complete" });
  const finished = finish.data<{ enrollment: { progressPercent: number; completedAt: string | null } }>()?.enrollment;
  check("learner: the course is complete (100%)", finish.status === 200 && finished?.progressPercent === 100 && Boolean(finished.completedAt), `status ${finish.status} ${finish.errorCode() ?? ""}`);

  await page(learner, "/certificates", certificateName);
  // Grades lists marked assignments only; quiz scores are not shown there.
  await page(learner, "/grades");
  await page(learner, "/my-courses", courseTitle);

  // Forgot password → reset → sign in with the new one.
  const beforeReset = mailIndex().length;
  const forgot = await visitor.post("/api/auth/forgot-password", { email: learnerEmail, surface: "tenant_client" });
  check("learner: ask for a password reset", forgot.status === 200, `status ${forgot.status} ${forgot.errorCode() ?? ""}`);
  const token = resetTokenIn(await mailFor(learnerEmail, beforeReset, /reset/i));
  check("learner: reset email carries a link", Boolean(token));
  if (token) {
    const resetPage = await visitor.get(`/auth/reset-password?token=${token}`);
    check("learner: reset page renders", resetPage.status === 200 && !ERROR_MARKER.test(resetPage.text), `status ${resetPage.status}`);
    const replacement = newPassword();
    const reset = await visitor.post("/api/auth/reset-password", { token: decodeURIComponent(token), password: replacement });
    check("learner: set a new password", reset.status === 200, `status ${reset.status} ${reset.errorCode() ?? ""}`);
    const reuse = await visitor.post("/api/auth/reset-password", { token: decodeURIComponent(token), password: newPassword() });
    check("learner: the reset link works once", reuse.status === 400, `status ${reuse.status}`);
    const revoked = await learner.get("/api/client/courses");
    check("learner: the reset signs out existing sessions", revoked.status === 401, `status ${revoked.status}`);
    const oldLogin = await learner.post("/api/auth/login", { email: learnerEmail, password, surface: "tenant_client" });
    check("learner: the old password no longer works", oldLogin.status === 401, `status ${oldLogin.status}`);
    const newLogin = await learner.post("/api/auth/login", { email: learnerEmail, password: replacement, surface: "tenant_client" });
    check("learner: sign in with the new password", newLogin.status === 200, `status ${newLogin.status} ${newLogin.errorCode() ?? ""}`);
    state.learnerPassword = replacement;
  }
}

async function crossChecks(): Promise<void> {
  section("4. Cross-checks");
  const tenantId = need(state.tenantId, "the academy");

  if (state.courseId) {
    type Row = { client: { email: string }; progressPercent: number; completedAt: string | null };
    const enrolments = (await admin.get(`/api/tenant/enrollments?courseId=${state.courseId}`)).data<Row[]>();
    const mine = enrolments?.find((e) => e.client.email === learnerEmail);
    check("admin: sees the learner's enrolment, completed", Boolean(mine?.completedAt) && mine?.progressPercent === 100, mine ? `progress ${mine.progressPercent}` : "no enrolment row");
    await page(admin, "/admin/enrollments", learnerEmail);
  }
  if (state.quizId) await page(admin, `/admin/quizzes/${state.quizId}`, `Etoe${run}`);
  await page(admin, "/admin/clients", learnerEmail);
  if (state.referralCode) await page(admin, "/admin/referrals", `Etoe${run}`);
  await page(admin, "/admin/activity");

  // Suspend.
  const suspend = await platform.patch(`/api/platform/tenants/${tenantId}`, { action: "suspend" });
  check("platform: suspend the academy", suspend.status === 200, `status ${suspend.status} ${suspend.errorCode() ?? ""}`);

  const learnerApi = await learner.get("/api/client/courses");
  check("suspended: the learner's session no longer works", learnerApi.status === 401, `status ${learnerApi.status}`);
  const adminApi = await admin.get("/api/tenant/courses");
  check("suspended: the admin's session no longer works", adminApi.status === 401, `status ${adminApi.status}`);
  const blockedLearner = await learner.post("/api/auth/login", { email: learnerEmail, password: state.learnerPassword ?? "", surface: "tenant_client" });
  check("suspended: learner sign-in is refused", blockedLearner.status === 403 && blockedLearner.errorCode() === "tenant_blocked", `status ${blockedLearner.status} ${blockedLearner.errorCode() ?? ""}`);
  const blockedAdmin = await admin.post("/api/auth/login", { email: ownerEmail, password: state.ownerPassword ?? "", surface: "tenant_admin" });
  check("suspended: admin sign-in is refused", blockedAdmin.status === 403 && blockedAdmin.errorCode() === "tenant_blocked", `status ${blockedAdmin.status} ${blockedAdmin.errorCode() ?? ""}`);
  const latePassword = newPassword();
  const blockedRegister = await visitor.post("/api/auth/register/client/start", {
    email: `late-${run}@e2e.test`,
    password: latePassword,
    confirm: latePassword,
    displayName: "Late",
  });
  check("suspended: registration is refused", blockedRegister.status === 403 && blockedRegister.errorCode() === "tenant_blocked", `status ${blockedRegister.status} ${blockedRegister.errorCode() ?? ""}`);
  const suspendedHome = await new Actor("visitor", admin.host).get("/");
  const suspendedCourse = await new Actor("visitor", admin.host).get(`/courses/${courseSlug}`);
  check(
    "suspended: the public site and course page are not served",
    !(suspendedHome.status === 200 && suspendedHome.text.includes(academyName) && suspendedCourse.status === 200 && suspendedCourse.text.includes(courseTitle)),
    `home ${suspendedHome.status}, course ${suspendedCourse.status}`
  );

  // Reactivate.
  const restore = await platform.patch(`/api/platform/tenants/${tenantId}`, { action: "restore" });
  check("platform: reactivate the academy", restore.status === 200, `status ${restore.status} ${restore.errorCode() ?? ""}`);
  const adminBack = await admin.post("/api/auth/login", { email: ownerEmail, password: state.ownerPassword ?? "", surface: "tenant_admin" });
  check("reactivated: admin can sign in again", adminBack.status === 200, `status ${adminBack.status} ${adminBack.errorCode() ?? ""}`);
  await page(admin, "/admin/dashboard");
  const learnerBack = await learner.post("/api/auth/login", { email: learnerEmail, password: state.learnerPassword ?? "", surface: "tenant_client" });
  check("reactivated: learner can sign in again", learnerBack.status === 200, `status ${learnerBack.status} ${learnerBack.errorCode() ?? ""}`);
  await page(learner, "/my-courses", courseTitle);

  // A session that has ended keeps the page that was asked for.
  const stale = new Actor("stale", admin.host);
  stale.setCookie("__mt-client-session", "stale-session-token");
  const ended = await stale.get("/grades");
  const target = ended.location ?? /\/auth\/login\?[^"'\\<\s]*session=ended/.exec(ended.text)?.[0] ?? "";
  check(
    "ended session: a learner page sends to sign-in with the page remembered",
    target.includes("/auth/login") && target.includes("next=%2Fgrades") && target.includes("session=ended"),
    `status ${ended.status} → ${target || "no redirect"}`
  );
  const signIn = await stale.get("/auth/login?next=%2Fgrades&session=ended");
  check("ended session: the sign-in page opens instead of looping", signIn.status === 200, `status ${signIn.status} → ${signIn.location ?? ""}`);

  const logout = await learner.post("/api/auth/logout");
  const after = await learner.get("/api/client/courses");
  check("learner: sign out", logout.status === 200 && after.status === 401, `statuses ${logout.status}/${after.status}`);

  const nowhere = await new Actor("visitor", `zz-none-${run}.${BASE_DOMAIN}`).get("/");
  check("unknown academy host returns 404", nowhere.status === 404, `status ${nowhere.status}`);
}

async function main(): Promise<void> {
  if (!MAIL_DIR) {
    console.error("E2E_MAIL_DIR is not set. Point it at the folder the test mail catcher writes to (NNN.eml files and index.log).");
    process.exit(2);
  }
  if (!existsSync(MAIL_DIR)) {
    console.error(`E2E_MAIL_DIR does not exist: ${MAIL_DIR}. Is the mail catcher running?`);
    process.exit(2);
  }
  console.log(`Lifecycle test against http://${TARGET}:${PORT} — academy "${slug}"`);

  for (const phase of [platformPhase, adminPhase, learnerPhase, crossChecks]) {
    try {
      await phase();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      check(`${phase.name} ran to the end`, false, message);
      if (!(e instanceof Abort) && e instanceof Error && e.stack) console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    }
  }

  // Leave the academy behind, switched off.
  section("5. Clean up");
  if (state.tenantId) {
    const off = await platform.patch(`/api/platform/tenants/${state.tenantId}`, { action: "suspend" });
    const status = (await platform.get(`/api/platform/tenants/${state.tenantId}`)).data<{ tenant: { status: string } }>()?.tenant.status;
    check("platform: the test academy is left suspended", off.status === 200 && status === "SUSPENDED", `status ${off.status}, academy ${status ?? "unknown"}`);
  }
  const signOut = await platform.post("/api/auth/logout");
  check("platform: sign out", signOut.status === 200, `status ${signOut.status}`);

  console.log(`\n${passed + failures.length} checks: ${passed} passed, ${failures.length} failed. Academy slug: ${slug}`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("The lifecycle test crashed:", e instanceof Error ? e.message : e);
  process.exit(1);
});

/**
 * Integrations hub — the pure parts, checked without a database or network:
 *
 *  - ICS (RFC 5545): CRLF, 75-octet folding (UTF-8 safe), TEXT escaping,
 *    UTC date-times, a weekly RRULE, monthly repeats written out like the
 *    learner calendar, events outside the horizon dropped;
 *  - team-alert payloads for Slack, Discord, Teams and Google Chat, and the
 *    webhook-host checks;
 *  - OIDC ID-token claim validation: good token, bad iss / aud / azp / exp /
 *    iat / nonce / email_verified;
 *  - PKCE S256 against RFC 7636 appendix B;
 *  - signed OAuth state: round trip, tampering, wrong key, expiry.
 *
 *   npm run verify:integrations
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";

config();
process.env.APP_ENCRYPTION_KEY = process.env.APP_ENCRYPTION_KEY || randomBytes(32).toString("base64");

let failed = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failed++;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

async function main() {
  const ics = await import("../lib/calendar/ics");
  const { eventsToIcs } = await import("../lib/calendar/feeds");
  const oauth = await import("../lib/integrations/oauth");
  const oidc = await import("../lib/integrations/oidc");
  const fmt = await import("../lib/integrations/alert-format");

  /* ───────────── ICS ───────────── */
  console.log("ICS");
  check("escapeText escapes \\ ; , and newlines", ics.escapeText("a\\b;c,d\ne\r\nf") === "a\\\\b\\;c\\,d\\ne\\nf", ics.escapeText("a\\b;c,d\ne\r\nf"));
  check("formatUtc", ics.formatUtc(new Date(Date.UTC(2026, 10, 28, 9, 5, 7))) === "20261128T090507Z");

  const long = "DESCRIPTION:" + "x".repeat(200);
  const folded = ics.foldLine(long);
  const physical = folded.split("\r\n");
  check("long line folds into several physical lines", physical.length === 3, physical.length);
  check("every physical line is at most 75 octets", physical.every((l) => Buffer.byteLength(l, "utf8") <= 75), physical.map((l) => Buffer.byteLength(l)));
  check("continuation lines start with one space", physical.slice(1).every((l) => l.startsWith(" ") && !l.startsWith("  ")));
  check("unfolding restores the line", folded.replace(/\r\n /g, "") === long);

  const multi = "SUMMARY:" + "é".repeat(60) + "😀".repeat(10);
  const mFolded = ics.foldLine(multi);
  const mLines = mFolded.split("\r\n");
  check("multi-byte line: every physical line ≤ 75 octets", mLines.every((l) => Buffer.byteLength(l, "utf8") <= 75), mLines.map((l) => Buffer.byteLength(l)));
  check("multi-byte line: no character split (round-trips)", mFolded.replace(/\r\n /g, "") === multi && !mFolded.includes("�"));

  const now = new Date(Date.UTC(2026, 10, 28, 12, 0, 0));
  const start = new Date(Date.UTC(2026, 11, 1, 15, 0, 0));
  const body = ics.buildIcs({
    prodId: "-//Test//Feed//EN",
    name: "Acme, Inc; Academy",
    generatedAt: now,
    events: [
      {
        uid: "event-1@acme.test",
        start,
        end: new Date(start.getTime() + 3600_000),
        summary: "Weekly class, room 2",
        description: "Bring notes;\nJoin: https://zoom.us/j/1",
        location: "Room 2",
        url: "https://zoom.us/j/1",
        repeat: { freq: "WEEKLY", until: new Date(Date.UTC(2027, 0, 31, 23, 59, 59)) },
      },
    ],
  });
  check("every line ends in CRLF (no bare LF)", body.endsWith("\r\n") && !/[^\r]\n/.test(body));
  check("VCALENDAR wrapper and version", body.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n") && body.endsWith("END:VCALENDAR\r\n"));
  check("calendar name escaped", body.includes("X-WR-CALNAME:Acme\\, Inc\\; Academy\r\n"));
  check("UID, DTSTAMP, DTSTART, DTEND in UTC", body.includes("UID:event-1@acme.test") && body.includes("DTSTAMP:20261128T120000Z") && body.includes("DTSTART:20261201T150000Z") && body.includes("DTEND:20261201T160000Z"));
  check("weekly RRULE with UNTIL", body.includes("RRULE:FREQ=WEEKLY;UNTIL=20270131T235959Z\r\n"), body);
  check("SUMMARY / DESCRIPTION escaped", body.includes("SUMMARY:Weekly class\\, room 2") && body.includes("DESCRIPTION:Bring notes\\;\\nJoin: https://zoom.us/j/1"));
  check("URL not TEXT-escaped", body.includes("URL:https://zoom.us/j/1\r\n"));
  check("no physical line over 75 octets", body.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75));

  type Ev = Parameters<typeof eventsToIcs>[0][number];
  const ev = (o: Partial<Ev>): Ev =>
    ({
      id: "e",
      tenantId: "t",
      title: "T",
      description: null,
      type: "LIVE_SESSION",
      startAt: start,
      endAt: null,
      location: null,
      url: null,
      audience: "ALL",
      clientId: null,
      clientGroupId: null,
      recurrence: "NONE",
      recurrenceUntil: null,
      createdAt: now,
      updatedAt: now,
      ...o,
    }) as Ev;
  const monthly = eventsToIcs([ev({ id: "m", startAt: new Date(Date.UTC(2026, 0, 31, 9)), recurrence: "MONTHLY" })], "acme.test", now);
  check("monthly repeat expanded into separate events", monthly.length >= 6 && new Set(monthly.map((m) => m.uid)).size === monthly.length, monthly.length);
  check("monthly expansion follows the calendar page (31 Jan → 28 Feb → 28 Mar…)", monthly.every((m) => m.start.getUTCDate() === 28), monthly.map((m) => m.start.toISOString()));
  const weekly = eventsToIcs([ev({ id: "w", recurrence: "WEEKLY" })], "acme.test", now);
  check("weekly repeat stays one event with an RRULE", weekly.length === 1 && weekly[0].repeat?.freq === "WEEKLY");
  check("live session without end lasts an hour", weekly[0].end.getTime() - weekly[0].start.getTime() === 3600_000);
  const old = eventsToIcs([ev({ id: "old", startAt: new Date(Date.UTC(2025, 0, 1)) }), ev({ id: "far", startAt: new Date(Date.UTC(2028, 0, 1)) })], "acme.test", now);
  check("events far in the past or future are left out", old.length === 0, old.length);
  const deadline = eventsToIcs([ev({ id: "d", type: "DEADLINE", title: "Essay" })], "acme.test", now);
  check("non-session events are labelled", deadline[0].summary === "Deadline: Essay");

  /* ───────────── alerts ───────────── */
  console.log("Team alerts");
  const msg = fmt.describeEvent(
    "payment.succeeded",
    { amountCents: 1500000, currency: "NGN", reference: "REF<1>" },
    { academy: "Acme <Academy>", adminOrigin: "https://acme.example.com", learner: { id: "c1", name: "Ada @everyone", email: "ada@example.com" } },
    now
  );
  check("message title", msg.title === "Payment received");
  check("message has amount and reference facts", msg.facts.some((f) => f.label === "Amount") && msg.facts.some((f) => f.value === "REF<1>"));

  const slack = fmt.formatSlack(msg) as { text: string; blocks: { type: string; text?: { text: string }; elements?: { text: string }[] }[] };
  check("Slack: fallback text and blocks", typeof slack.text === "string" && Array.isArray(slack.blocks) && slack.blocks[0].type === "header");
  check("Slack: < > & escaped in mrkdwn", JSON.stringify(slack.blocks).includes("REF&lt;1&gt;") && !JSON.stringify(slack.blocks).includes("REF<1>"));
  check("Slack: admin link in context", JSON.stringify(slack.blocks).includes("<https://acme.example.com/admin/course-payments|Open in admin>"));

  const discord = fmt.formatDiscord(msg) as { embeds: { title: string; fields: { value: string }[]; timestamp: string }[]; allowed_mentions: { parse: string[] } };
  check("Discord: one embed with fields and timestamp", discord.embeds.length === 1 && discord.embeds[0].fields.length >= 2 && discord.embeds[0].timestamp === now.toISOString());
  check("Discord: mentions disabled and @ defused", discord.allowed_mentions.parse.length === 0 && !JSON.stringify(discord.embeds).includes("@everyone"));

  const teams = fmt.formatTeams(msg) as { type: string; attachments: { contentType: string; content: { type: string; body: { type: string }[]; actions?: unknown[] } }[] };
  check("Teams: Adaptive Card in a message envelope", teams.type === "message" && teams.attachments[0].contentType === "application/vnd.microsoft.card.adaptive" && teams.attachments[0].content.type === "AdaptiveCard");
  check("Teams: FactSet and an OpenUrl action", teams.attachments[0].content.body.some((b) => b.type === "FactSet") && (teams.attachments[0].content.actions?.length ?? 0) === 1);

  const gchat = fmt.formatGoogleChat(msg) as { text: string };
  check("Google Chat: bold title and link", gchat.text.startsWith("*Payment received*") && gchat.text.includes("<https://acme.example.com/admin/course-payments|Open in admin>"));
  check("Google Chat: angle brackets in values cannot form links", !gchat.text.includes("REF<1>"));

  const ping = fmt.describeEvent("ping", {}, { academy: "Acme", adminOrigin: "https://a" }, now);
  check("test message", ping.title === "Test alert");

  const urlCases: [Parameters<typeof fmt.validateAlertUrl>[0], string, boolean][] = [
    ["slack", "https://hooks.slack.com/services/T000/B000/XXXX", true],
    ["slack", "http://hooks.slack.com/services/T000/B000/XXXX", false],
    ["slack", "https://hooks.slack.com.evil.com/services/T/B/X", false],
    ["slack", "https://evil.com/services/T/B/X", false],
    ["discord", "https://discord.com/api/webhooks/123456/abcDEF-_x", true],
    ["discord", "https://discord.com/channels/1/2", false],
    ["teams", "https://acme.webhook.office.com/webhookb2/abc", true],
    ["teams", "https://prod-12.westus.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke?sig=x", true],
    ["teams", "https://webhook.office.com.evil.io/x", false],
    ["google_chat", "https://chat.googleapis.com/v1/spaces/AAA/messages?key=k&token=t", true],
    ["google_chat", "https://chat.googleapis.com/v1/spaces/AAA/members", false],
    ["slack", "https://user:pw@hooks.slack.com/services/T/B/X", false],
  ];
  for (const [p, u, want] of urlCases) check(`${p} URL ${want ? "accepted" : "rejected"}: ${u.slice(0, 60)}`, fmt.validateAlertUrl(p, u).ok === want);

  /* ───────────── OIDC ───────────── */
  console.log("OIDC ID token");
  const nowSec = 1_800_000_000;
  const good = {
    iss: "https://accounts.google.com",
    aud: "client-123",
    azp: "client-123",
    sub: "1100",
    email: "Ada@School.edu",
    email_verified: true,
    given_name: "Ada",
    family_name: "Lovelace",
    nonce: "n-1",
    iat: nowSec - 10,
    exp: nowSec + 3600,
  };
  const expect = { issuer: "https://accounts.google.com", clientId: "client-123", nonce: "n-1", nowSec };
  const jwt = `${Buffer.from('{"alg":"RS256"}').toString("base64url")}.${Buffer.from(JSON.stringify(good)).toString("base64url")}.sig`;
  check("decodeJwtPayload reads the payload", oidc.decodeJwtPayload(jwt).sub === "1100");
  let threw = false;
  try {
    oidc.decodeJwtPayload("not-a-jwt");
  } catch {
    threw = true;
  }
  check("decodeJwtPayload rejects garbage", threw);
  const ok = oidc.validateIdTokenClaims(good, expect);
  check("valid token accepted, email lower-cased", ok.ok && ok.identity.email === "ada@school.edu" && ok.identity.subject === "1100", ok);
  const reason = (claims: Record<string, unknown>) => {
    const r = oidc.validateIdTokenClaims(claims, expect);
    return r.ok ? "ok" : r.reason;
  };
  check("wrong issuer rejected", reason({ ...good, iss: "https://evil.example.com" }) === "bad_issuer");
  check("wrong audience rejected", reason({ ...good, aud: "someone-else", azp: undefined }) === "bad_audience");
  check("audience array without our azp rejected", reason({ ...good, aud: ["client-123", "other"], azp: "other" }) === "bad_azp");
  check("audience array with our azp accepted", reason({ ...good, aud: ["client-123", "other"] }) === "ok");
  check("expired token rejected", reason({ ...good, exp: nowSec - 3600 }) === "expired");
  check("token from the future rejected", reason({ ...good, iat: nowSec + 3600 }) === "issued_in_future");
  check("stale token rejected", reason({ ...good, iat: nowSec - 7200 }) === "too_old");
  check("nonce mismatch rejected", reason({ ...good, nonce: "n-2" }) === "bad_nonce");
  check("missing nonce rejected", reason({ ...good, nonce: undefined }) === "bad_nonce");
  check("unverified email rejected", reason({ ...good, email_verified: false }) === "email_unverified");
  check("missing sub rejected", reason({ ...good, sub: "" }) === "no_subject");
  const entra = oidc.validateIdTokenClaims(
    { ...good, iss: "https://login.microsoftonline.com/tid/v2.0", email: undefined, email_verified: undefined, preferred_username: "Grace@Contoso.com" },
    { ...expect, issuer: "https://login.microsoftonline.com/tid/v2.0" }
  );
  check("Entra: preferred_username used as email", entra.ok && entra.identity.email === "grace@contoso.com");
  check("email domain allow-list", oidc.emailDomainAllowed("a@school.edu", ["school.edu"]) && !oidc.emailDomainAllowed("a@evil.edu", ["school.edu"]) && oidc.emailDomainAllowed("a@x.y", []));
  check("Entra issuer helper", oidc.entraIssuer("contoso.onmicrosoft.com") === "https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0");

  /* ───────────── PKCE ───────────── */
  console.log("PKCE");
  check(
    "RFC 7636 appendix B vector",
    oauth.pkceChallengeS256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") === "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
  );
  const v = oauth.newPkceVerifier();
  check("new verifier is 43 unreserved chars", /^[A-Za-z0-9_-]{43}$/.test(v), v);

  /* ───────────── signed state ───────────── */
  console.log("Signed state");
  const key = randomBytes(32);
  const state = oauth.signState({ t: "tenant-1", s: "acme", u: "user-1", n: "nonce", exp: Math.floor(Date.now() / 1000) + 600 }, key);
  const back = oauth.verifyState<{ t: string; exp: number }>(state, key);
  check("round trip", back.ok && back.payload.t === "tenant-1");
  const [b, mac] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ t: "tenant-2", s: "acme", u: "user-1", n: "nonce", exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  check("payload swapped → bad signature", (oauth.verifyState(`${forged}.${mac}`, key) as { reason?: string }).reason === "bad_signature");
  const flipped = mac.slice(0, -1) + (mac.endsWith("A") ? "B" : "A");
  check("signature altered → bad signature", (oauth.verifyState(`${b}.${flipped}`, key) as { reason?: string }).reason === "bad_signature");
  check("other key → bad signature", (oauth.verifyState(state, randomBytes(32)) as { reason?: string }).reason === "bad_signature");
  const expired = oauth.signState({ t: "x", exp: Math.floor(Date.now() / 1000) - 1 }, key);
  check("expired state rejected", (oauth.verifyState(expired, key) as { reason?: string }).reason === "expired");
  check("malformed state rejected", (oauth.verifyState("nope", key) as { reason?: string }).reason === "malformed");
  const d1 = oauth.derivedVerifier("nonce", key);
  check("derived verifier is deterministic, key-bound and RFC-shaped", d1 === oauth.derivedVerifier("nonce", key) && d1 !== oauth.derivedVerifier("nonce", randomBytes(32)) && /^[A-Za-z0-9_-]{43}$/.test(d1));
  check("purpose keys differ", !oauth.deriveKey(key, "a").equals(oauth.deriveKey(key, "b")));
  check("safeEqual", oauth.safeEqual("abc", "abc") && !oauth.safeEqual("abc", "abd") && !oauth.safeEqual("abc", "ab"));

  console.log(failed === 0 ? "\nAll integration checks passed." : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

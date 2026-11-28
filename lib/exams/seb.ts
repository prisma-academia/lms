import { createHash, timingSafeEqual } from "node:crypto";
import type { ExamSecurity } from "@/lib/exams/settings";

/**
 * Safe Exam Browser (https://safeexambrowser.org) support.
 *
 * SEB is a free kiosk browser for Windows, macOS and iPadOS. While it runs the
 * candidate cannot switch apps, open other sites, copy out or quit without the
 * invigilator's password — the "cannot close or navigate away" a normal web
 * page can never guarantee.
 *
 * How the two sides trust each other: on every request SEB sends
 *   X-SafeExamBrowser-ConfigKeyHash = SHA-256(full URL + Config Key)
 *   X-SafeExamBrowser-RequestHash   = SHA-256(full URL + Browser Exam Key)
 * The Config Key identifies the exact settings file; staff copy it from the
 * SEB Config Tool after opening the `.seb` file this module generates. A
 * request matching either key came from SEB running our configuration.
 */

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[a-f0-9]+$/i.test(a)) return false;
  return timingSafeEqual(Buffer.from(a.toLowerCase(), "hex"), Buffer.from(b.toLowerCase(), "hex"));
}

/**
 * The URL exactly as SEB saw it. Behind a proxy (Dokploy, Cloudflare) the
 * request URL is internal, so the forwarded host and scheme are used.
 */
export function publicUrlOf(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}${url.pathname}${url.search}`;
}

export type SebCheck = { ok: boolean; reason: "not_required" | "verified" | "missing" | "mismatch" | "no_keys" };

/**
 * Verify SEB headers for a request. `pageUrl` overrides the URL used in the
 * hash — the exam window's API calls send the page URL SEB is showing, because
 * SEB hashes the URL of the request it makes (fetches included).
 */
export function verifySeb(
  headers: Headers,
  url: string,
  security: Pick<ExamSecurity, "lockdown" | "seb">
): SebCheck {
  if (security.lockdown !== "SEB_REQUIRED") return { ok: true, reason: "not_required" };
  const { configKeys, browserExamKeys } = security.seb;
  if (configKeys.length === 0 && browserExamKeys.length === 0) return { ok: false, reason: "no_keys" };
  const ck = headers.get("x-safeexambrowser-configkeyhash");
  const rh = headers.get("x-safeexambrowser-requesthash");
  if (!ck && !rh) return { ok: false, reason: "missing" };
  const clean = url.split("#")[0];
  if (ck && configKeys.some((k) => safeEqualHex(ck, sha256Hex(clean + k.toLowerCase())))) return { ok: true, reason: "verified" };
  if (rh && browserExamKeys.some((k) => safeEqualHex(rh, sha256Hex(clean + k.toLowerCase())))) return { ok: true, reason: "verified" };
  return { ok: false, reason: "mismatch" };
}

/** Does this request look like SEB at all (for friendlier messages)? */
export function looksLikeSeb(headers: Headers): boolean {
  const ua = headers.get("user-agent") ?? "";
  return /SEB\//.test(ua) || headers.has("x-safeexambrowser-configkeyhash") || headers.has("x-safeexambrowser-requesthash");
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plistValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "<true/>" : "<false/>";
  if (typeof v === "number") return Number.isInteger(v) ? `<integer>${v}</integer>` : `<real>${v}</real>`;
  if (typeof v === "string") return `<string>${xml(v)}</string>`;
  if (Array.isArray(v)) return `<array>${v.map(plistValue).join("")}</array>`;
  if (v && typeof v === "object") {
    return `<dict>${Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `<key>${xml(k)}</key>${plistValue(val)}`)
      .join("")}</dict>`;
  }
  return "<string></string>";
}

/**
 * A Safe Exam Browser configuration file (unencrypted plist) for one exam.
 * Opening it starts SEB straight on the exam lobby, allows only this
 * academy's exam pages, and locks the machine down.
 */
export function sebConfigFile(input: {
  origin: string;
  examId: string;
  examTitle: string;
  quitPassword: string | null;
}): string {
  const host = new URL(input.origin).host;
  const settings: Record<string, unknown> = {
    originatorVersion: "PrismaLMS",
    startURL: `${input.origin}/exam/${input.examId}`,
    quitURL: `${input.origin}/exam/${input.examId}/done?quit=1`,
    quitURLConfirm: false,
    sendBrowserExamKey: true,
    browserWindowTitleSuffix: ` — ${input.examTitle}`,
    // Kiosk
    browserViewMode: 1,
    mainBrowserWindowWidth: "100%",
    mainBrowserWindowHeight: "100%",
    enableBrowserWindowToolbar: false,
    hideBrowserWindowToolbar: true,
    showMenuBar: false,
    showTaskBar: true,
    showReloadButton: true,
    showTime: true,
    allowQuit: !!input.quitPassword,
    ...(input.quitPassword ? { hashedQuitPassword: sha256Hex(input.quitPassword) } : {}),
    // Navigation
    newBrowserWindowByLinkPolicy: 0,
    newBrowserWindowByScriptPolicy: 0,
    allowBrowsingBackForward: false,
    URLFilterEnable: true,
    URLFilterEnableContentFilter: false,
    URLFilterRules: [
      { active: true, regex: false, action: 1, expression: `${host}/exam*` },
      { active: true, regex: false, action: 1, expression: `${host}/api/exam/*` },
      { active: true, regex: false, action: 1, expression: `${host}/_next/*` },
      { active: true, regex: false, action: 1, expression: `${host}/exam-sw.js` },
    ],
    // Machine lockdown
    enablePrintScreen: false,
    enablePrivateClipboard: true,
    allowSpellCheck: false,
    allowDictionaryLookup: false,
    allowDownUploads: true,
    allowAudioCapture: true,
    allowVideoCapture: false,
    enableRightMouse: false,
    enableAltTab: false,
    enableAltF4: false,
    enableCtrlEsc: false,
    enableEsc: false,
    enableStartMenu: false,
    enableF1: false,
    enableF3: false,
    enableF5: true,
    enableF12: false,
    allowVirtualMachine: false,
    allowScreenSharing: false,
    allowSiri: false,
    detectStoppedProcess: true,
    killExplorerShell: false,
    allowWlan: true,
    examSessionClearCookiesOnStart: true,
    examSessionClearCookiesOnEnd: true,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">${plistValue(settings)}</plist>
`;
}

/** `sebs://` opens SEB directly with the config at an https URL. */
export function sebLaunchUrl(configHttpsUrl: string): string {
  return configHttpsUrl.replace(/^https:\/\//, "sebs://").replace(/^http:\/\//, "seb://");
}

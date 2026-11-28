import { z } from "zod";

/**
 * Typed shapes for an exam's JSON columns: the lockdown policy
 * (`securityJson`), candidate tools (`toolsJson`) and grade bands
 * (`gradeBandsJson`). Pure — imported by the server and the exam window alike.
 *
 * Reads never throw: a malformed column falls back to the defaults.
 */

export const LOCKDOWN_LEVELS = ["STANDARD", "STRICT", "SEB_REQUIRED"] as const;
export type LockdownLevel = (typeof LOCKDOWN_LEVELS)[number];

export const securitySchema = z.object({
  lockdown: z.enum(LOCKDOWN_LEVELS).default("STRICT"),
  /** Questions are hidden until the window is fullscreen. */
  requireFullscreen: z.boolean().default(true),
  blockClipboard: z.boolean().default(true),
  blockContextMenu: z.boolean().default(true),
  blockPrint: z.boolean().default(true),
  /** F12, Ctrl+Shift+I/J/C, Ctrl+U, Ctrl+S, F5/Ctrl+R. */
  blockShortcuts: z.boolean().default(true),
  detectTabSwitch: z.boolean().default(true),
  detectMultiScreen: z.boolean().default(true),
  /** Faint tiled name + Exam ID over the paper, to deter photos. */
  watermark: z.boolean().default(true),
  /** A second device opening the attempt is refused until an invigilator resets it. */
  singleDevice: z.boolean().default(true),
  /** Violations before `onMaxViolations` happens. 0 = never (log only). */
  maxViolations: z.number().int().min(0).max(50).default(5),
  onMaxViolations: z.enum(["WARN", "LOCK", "AUTO_SUBMIT"]).default("LOCK"),
  /** Auto-submit if away from the exam (tab hidden / not fullscreen) this long. NULL = off. */
  awayAutoSubmitSec: z.number().int().min(10).max(3600).nullable().default(null),
  /** Enforce each sitting's IP allowlist. */
  enforceIpAllowlist: z.boolean().default(true),
  /** Safe Exam Browser keys. Any match passes. Hex SHA-256 keys from the SEB config tool. */
  seb: z
    .object({
      configKeys: z.array(z.string().regex(/^[a-f0-9]{64}$/i)).max(10).default([]),
      browserExamKeys: z.array(z.string().regex(/^[a-f0-9]{64}$/i)).max(10).default([]),
      /** Shown to invigilators only; lets them quit SEB on a machine. */
      quitPassword: z.string().max(100).nullable().default(null),
    })
    .default({ configKeys: [], browserExamKeys: [], quitPassword: null }),
});
export type ExamSecurity = z.infer<typeof securitySchema>;

export const SECURITY_PRESETS: Record<LockdownLevel, Partial<ExamSecurity>> = {
  STANDARD: {
    requireFullscreen: false,
    blockClipboard: true,
    blockContextMenu: true,
    blockPrint: true,
    blockShortcuts: false,
    detectTabSwitch: true,
    detectMultiScreen: false,
    watermark: false,
    singleDevice: true,
    maxViolations: 0,
    onMaxViolations: "WARN",
    awayAutoSubmitSec: null,
  },
  STRICT: {
    requireFullscreen: true,
    blockClipboard: true,
    blockContextMenu: true,
    blockPrint: true,
    blockShortcuts: true,
    detectTabSwitch: true,
    detectMultiScreen: true,
    watermark: true,
    singleDevice: true,
    maxViolations: 5,
    onMaxViolations: "LOCK",
  },
  SEB_REQUIRED: {
    requireFullscreen: false, // SEB is a kiosk already.
    blockClipboard: true,
    blockContextMenu: true,
    blockPrint: true,
    blockShortcuts: true,
    detectTabSwitch: true,
    detectMultiScreen: true,
    watermark: true,
    singleDevice: true,
    maxViolations: 3,
    onMaxViolations: "LOCK",
  },
};

export function parseSecurity(json: unknown): ExamSecurity {
  const r = securitySchema.safeParse(json && typeof json === "object" ? json : {});
  return r.success ? r.data : securitySchema.parse({});
}

export const toolsSchema = z.object({
  scratchpad: z.boolean().default(true),
  highlighter: z.boolean().default(true),
  eliminator: z.boolean().default(true),
  lineReader: z.boolean().default(true),
  textToSpeech: z.boolean().default(false),
  /** Show the question palette (grid of numbers). */
  palette: z.boolean().default(true),
  /** Candidates may flag questions for review. */
  flagging: z.boolean().default(true),
  /** Show "answered / total" progress. */
  progress: z.boolean().default(true),
});
export type ExamTools = z.infer<typeof toolsSchema>;

export function parseTools(json: unknown): ExamTools {
  const r = toolsSchema.safeParse(json && typeof json === "object" ? json : {});
  return r.success ? r.data : toolsSchema.parse({});
}

export const gradeBandSchema = z.object({
  min: z.number().min(0).max(100),
  label: z.string().min(1).max(20),
  remark: z.string().max(100).default(""),
});
export type GradeBand = z.infer<typeof gradeBandSchema>;

export const gradeBandsSchema = z.array(gradeBandSchema).max(20);

export const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { min: 70, label: "A", remark: "Excellent" },
  { min: 60, label: "B", remark: "Very good" },
  { min: 50, label: "C", remark: "Good" },
  { min: 45, label: "D", remark: "Fair" },
  { min: 40, label: "E", remark: "Pass" },
  { min: 0, label: "F", remark: "Fail" },
];

export function parseGradeBands(json: unknown): GradeBand[] {
  const r = gradeBandsSchema.safeParse(json);
  return r.success ? [...r.data].sort((a, b) => b.min - a.min) : [];
}

export function bandFor(percent: number, bands: GradeBand[]): GradeBand | null {
  return [...bands].sort((a, b) => b.min - a.min).find((b) => percent >= b.min) ?? null;
}

/* ───────────────────────────── random pools ───────────────────────────── */

export const poolRuleSchema = z.object({
  id: z.string().min(1).max(40),
  bankId: z.string().min(1),
  tagIds: z.array(z.string()).max(20).default([]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable().default(null),
  types: z.array(z.string()).max(16).default([]),
  count: z.number().int().min(1).max(500),
  /** Points for each drawn question. NULL = the question's own points. */
  points: z.number().int().min(0).max(1000).nullable().default(null),
});
export type PoolRule = z.infer<typeof poolRuleSchema>;

export function parsePools(json: unknown): PoolRule[] {
  const r = z.array(poolRuleSchema).max(30).safeParse(json);
  return r.success ? r.data : [];
}

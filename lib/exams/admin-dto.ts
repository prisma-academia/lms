import type { ExamSecurity, ExamTools, GradeBand, PoolRule } from "@/lib/exams/settings";
import type { QuestionTypeValue } from "@/lib/schemas/question";

/**
 * The shapes the exam-authoring admin passes between its server page, its API
 * routes and its Client Components. Types only (plus a few label maps), so a
 * Client Component can import it without pulling in Prisma.
 *
 * Dates travel as ISO strings.
 */

export type ExamStatusValue = "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
export type ExamKindValue = "COURSE" | "STANDALONE";
export type ExamNavigationValue = "FREE" | "LINEAR" | "SECTION_LOCKED";
export type ExamResultReleaseValue = "IMMEDIATE" | "AFTER_CLOSE" | "MANUAL";
export type ExamReviewModeValue = "NONE" | "SCORE_ONLY" | "ANSWERS" | "ANSWERS_WITH_EXPLANATIONS";
export type ExamCalculatorValue = "NONE" | "BASIC" | "SCIENTIFIC";
export type ExamAccessModeValue = "INVITED" | "ENROLLED" | "ACCESS_CODE";
export type CandidateStatusValue = "ACTIVE" | "BLOCKED" | "WITHDRAWN";
export type DifficultyValue = "EASY" | "MEDIUM" | "HARD";

export type ExamQuestionSummary = {
  id: string;
  type: QuestionTypeValue;
  prompt: string;
  points: number;
  difficulty: DifficultyValue | null;
  bankId: string;
  bankName: string;
};

export type ExamItemDTO = {
  id: string;
  questionId: string;
  /** Override for this exam; NULL = the question's own points. */
  points: number | null;
  question: ExamQuestionSummary;
};

export type ExamSectionDTO = {
  id: string;
  title: string;
  instructions: string | null;
  sortOrder: number;
  timeLimitMin: number | null;
  shuffle: boolean;
  pools: PoolRule[];
  items: ExamItemDTO[];
};

export type ExamSittingDTO = {
  id: string;
  name: string;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  capacity: number | null;
  ipAllowlist: string[];
  pausedAt: string | null;
  candidateCount: number;
};

export type ExamCounts = {
  candidates: number;
  attempts: number;
  /** IN_PROGRESS, PAUSED or LOCKED. */
  live: number;
  submitted: number;
};

export type ChecklistLevel = "ok" | "warn" | "error";

export type ChecklistItem = {
  key: string;
  label: string;
  level: ChecklistLevel;
  detail: string;
};

export type ExamDetail = {
  id: string;
  title: string;
  code: string | null;
  description: string | null;
  instructionsHtml: string | null;
  status: ExamStatusValue;
  kind: ExamKindValue;
  courseId: string | null;
  durationMin: number;
  opensAt: string | null;
  closesAt: string | null;
  lateEntryMin: number | null;
  attemptsAllowed: number;
  cooldownMin: number | null;
  navigation: ExamNavigationValue;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  passMark: number;
  negativeMarking: number | null;
  gradeBands: GradeBand[];
  resultRelease: ExamResultReleaseValue;
  reviewMode: ExamReviewModeValue;
  calculator: ExamCalculatorValue;
  formulaSheetHtml: string | null;
  tools: ExamTools;
  security: ExamSecurity;
  accessMode: ExamAccessModeValue;
  accessCode: string | null;
  pinLogin: boolean;
  offlineGraceMin: number;
  certificateId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sections: ExamSectionDTO[];
  sittings: ExamSittingDTO[];
  counts: ExamCounts;
  /** Fixed points plus the expected points of random draws. */
  estimatedPoints: number;
  checklist: ChecklistItem[];
};

export type CandidateRow = {
  id: string;
  candidateNo: string;
  fullName: string;
  email: string | null;
  regNumber: string | null;
  clientId: string | null;
  sittingId: string | null;
  sittingName: string | null;
  extraTimePct: number;
  status: CandidateStatusValue;
  hasPin: boolean;
  pinLocked: boolean;
  attemptCount: number;
  latestAttempt: {
    id: string;
    attemptNo: number;
    status: string;
    scorePercent: number | null;
    passed: boolean | null;
    gradingStatus: string | null;
  } | null;
};

/** A candidate with the plain PIN that was just issued. Shown once. */
export type IssuedPin = {
  id: string;
  candidateNo: string;
  fullName: string;
  email: string | null;
  regNumber: string | null;
  pin: string;
  created: boolean;
};

export type ExamListRow = {
  id: string;
  title: string;
  code: string | null;
  status: ExamStatusValue;
  kind: ExamKindValue;
  durationMin: number;
  opensAt: string | null;
  closesAt: string | null;
  courseTitle: string | null;
  candidates: number;
  attempts: number;
  live: number;
};

export const EXAM_STATUS_LABEL: Record<ExamStatusValue, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  CLOSED: "Closed",
  ARCHIVED: "Archived",
};

export const EXAM_STATUS_COLOR: Record<ExamStatusValue, string | undefined> = {
  DRAFT: "var(--muted)",
  PUBLISHED: "var(--success)",
  CLOSED: "var(--warning)",
  ARCHIVED: undefined,
};

export const DIFFICULTY_LABEL: Record<DifficultyValue, string> = {
  EASY: "Easy",
  MEDIUM: "Medium",
  HARD: "Hard",
};

export const ATTEMPT_STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  PAUSED: "Paused",
  LOCKED: "Locked",
  SUBMITTED: "Submitted",
  TERMINATED: "Terminated",
};

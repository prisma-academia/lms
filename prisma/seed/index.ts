import type { rawPrisma } from "../../lib/db/raw-client";

export const DAY = 86400000;
export const SLUG = "demo";
export const PASSWORD = "Password123!";

export type CourseRef = {
  courseId: string;
  lessonIds: string[];
};

export type SeedContext = {
  prisma: typeof rawPrisma;
  tenantId: string;
  now: number;
  passwordHash: string;
  ids: {
    ownerId: string;
    instructorId: string;
    clientId: string;
    clientGroupId: string;
    userGroupId: string;
    courseBySlug: Record<string, CourseRef>;
    programmeBySlug: Record<string, string>;
    quizId: string | null;
    questionBankId: string | null;
    certificateId: string | null;
  };
};

export function createInitialContext(
  prisma: typeof rawPrisma,
  tenantId: string,
  passwordHash: string
): SeedContext {
  return {
    prisma,
    tenantId,
    passwordHash,
    now: Date.now(),
    ids: {
      ownerId: "",
      instructorId: "",
      clientId: "",
      clientGroupId: "",
      userGroupId: "",
      courseBySlug: {},
      programmeBySlug: {},
      quizId: null,
      questionBankId: null,
      certificateId: null,
    },
  };
}

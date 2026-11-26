/**
 * Which quizzes change behaviour now that the pass mark is enforced.
 *
 * Until this release every quiz gated its lesson at 100%, whatever pass mark
 * was stored on it. The stored mark is now the one that applies. For a quiz
 * with no stored mark nothing changes (unset still means 100%). For a quiz
 * whose stored mark is below 100, learners who were stuck may now be let
 * through — which is what its author asked for, but worth a look before the
 * release goes live, because nobody has seen that number take effect yet.
 *
 * Read-only: this script changes nothing.
 *
 *   npm run report:pass-marks                  # every academy
 *   npm run report:pass-marks -- --tenant demo # one academy
 */
import "dotenv/config";
import { rawPrisma } from "../lib/db/raw-client";
import { effectivePassMark } from "../lib/assessments/pass-mark";

const args = process.argv.slice(2);
const tenantSlug = args.includes("--tenant") ? args[args.indexOf("--tenant") + 1] : null;

async function main() {
  const quizzes = await rawPrisma.quiz.findMany({
    where: {
      passingScore: { not: null, lt: 100 },
      ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
    },
    orderBy: [{ tenantId: "asc" }, { title: "asc" }],
    select: {
      id: true,
      title: true,
      passingScore: true,
      tenant: { select: { slug: true, name: true } },
      questions: { select: { question: { select: { type: true } } } },
    },
  });

  const unset = await rawPrisma.quiz.count({
    where: { passingScore: null, ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}) },
  });
  const full = await rawPrisma.quiz.count({
    where: { passingScore: { gte: 100 }, ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}) },
  });

  console.log(`Quizzes with no pass mark, or a mark of 100: ${unset + full} — unchanged, still 100%.`);
  console.log(`Quizzes whose stored mark now takes effect: ${quizzes.length}\n`);
  if (quizzes.length === 0) return;

  // Attempts that were graded below 100 but at or above the stored mark: these
  // learners were held back before and will be let through now.
  for (const quiz of quizzes) {
    const mark = effectivePassMark(quiz.passingScore);
    const [inUse, unblocked] = await Promise.all([
      rawPrisma.lesson.count({
        where: { contentType: "QUIZ", contentJson: { path: ["quizId"], equals: quiz.id } },
      }),
      rawPrisma.quizAttempt.findMany({
        where: { quizId: quiz.id, gradingStatus: "GRADED", scorePercent: { gte: mark, lt: 100 } },
        distinct: ["clientId"],
        select: { clientId: true },
      }),
    ]);
    const essays = quiz.questions.filter((q) => q.question.type === "ESSAY").length;
    console.log(
      [
        `[${quiz.tenant.slug}] ${quiz.title}`,
        `    pass mark ${mark}% (was treated as 100%)`,
        `    ${quiz.questions.length} question(s)${essays ? `, ${essays} written` : ""}; used by ${inUse} lesson(s)`,
        `    ${unblocked.length} learner(s) have an earlier attempt that now counts as a pass`,
        `    /admin/quizzes/${quiz.id}`,
      ].join("\n")
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => rawPrisma.$disconnect());

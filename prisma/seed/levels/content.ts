import type { SeedContext } from "../index";
import { seedCourses } from "../modules/courses";
import { seedProgrammes } from "../modules/programmes";
import { seedEnrollments } from "../modules/enrollments";
import { seedQuizzes } from "../modules/quizzes";
import { seedAssignments } from "../modules/assignments";
import { seedCertificates } from "../modules/certificates";
import { seedComms } from "../modules/comms";
import { seedAdminData } from "../modules/admin-data";

export async function seedContent(ctx: SeedContext): Promise<void> {
  await seedCourses(ctx);
  await seedQuizzes(ctx);
  await seedProgrammes(ctx);
  await seedEnrollments(ctx);
  await seedAssignments(ctx);
  await seedCertificates(ctx);
  await seedComms(ctx);
  await seedAdminData(ctx);
}

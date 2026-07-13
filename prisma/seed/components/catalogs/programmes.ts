export type ProgrammeCourseSeed = {
  courseSlug: string;
  required: boolean;
  sortOrder: number;
  groupLabel?: string;
};

export type ProgrammeSeed = {
  title: string;
  slug: string;
  description: string;
  courses: ProgrammeCourseSeed[];
  /** Demo student enrolled in this programme. */
  studentEnrolled?: boolean;
  /** Price in kobo. Omit or 0 = free (bundle self-enroll). */
  priceCents?: number;
};

export const PROGRAMME_CATALOG: ProgrammeSeed[] = [
  {
    title: "STEM Foundations",
    slug: "stem-foundations",
    description:
      "Core science and tech skills — biology, coding, and data for WAEC and beyond.",
    studentEnrolled: true,
    courses: [
      { courseSlug: "biology-waec", required: true, sortOrder: 0, groupLabel: "Core" },
      { courseSlug: "intro-javascript", required: true, sortOrder: 1, groupLabel: "Core" },
      { courseSlug: "statistics-sme", required: false, sortOrder: 2, groupLabel: "Elective" },
    ],
  },
  {
    title: "Professional Skills Track",
    slug: "professional-skills",
    description:
      "Design and communication skills for graduates entering the workforce.",
    studentEnrolled: false,
    priceCents: 2_500_000, // ₦25,000 bundle
    courses: [
      { courseSlug: "graphic-design-social", required: true, sortOrder: 0, groupLabel: "Creative" },
      { courseSlug: "public-speaking-grads", required: true, sortOrder: 1, groupLabel: "Communication" },
    ],
  },
];

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
    courses: [
      { courseSlug: "graphic-design-social", required: true, sortOrder: 0, groupLabel: "Creative" },
      { courseSlug: "public-speaking-grads", required: true, sortOrder: 1, groupLabel: "Communication" },
    ],
  },
];

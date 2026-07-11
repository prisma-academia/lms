export type ResourceSeed = {
  name: string;
  contentType: string;
  sizeBytes: number;
  groupPath: string[];
  tags: string[];
};

export const RESOURCE_CATALOG: ResourceSeed[] = [
  {
    name: "WAEC Biology syllabus 2026.pdf",
    contentType: "application/pdf",
    sizeBytes: 1_240_000,
    groupPath: ["Course Materials", "Biology"],
    tags: ["waec", "biology", "syllabus"],
  },
  {
    name: "Osmosis lab worksheet.pdf",
    contentType: "application/pdf",
    sizeBytes: 520_000,
    groupPath: ["Course Materials", "Biology"],
    tags: ["biology", "lab"],
  },
  {
    name: "JavaScript cheatsheet — arrays.pdf",
    contentType: "application/pdf",
    sizeBytes: 380_000,
    groupPath: ["Course Materials"],
    tags: ["javascript", "reference"],
  },
  {
    name: "Brand colour palette — Nigeria SMEs.png",
    contentType: "image/png",
    sizeBytes: 890_000,
    groupPath: ["Course Materials"],
    tags: ["design", "branding"],
  },
];

export type TemplateSeed = {
  type: string;
  name: string;
  contentJson: Record<string, unknown>;
};

export const TEMPLATE_CATALOG: TemplateSeed[] = [
  {
    type: "email_welcome",
    name: "Welcome email — new learner",
    contentJson: {
      subject: "Welcome to {{tenantName}}",
      body: "Hi {{firstName}},\n\nYour account at Greenfield Academy Lagos is ready. Log in to explore your courses and join live sessions.\n\nNgọzi na ụtọ! (Good luck!)",
    },
  },
];

export type ActivitySeed = {
  action: string;
  targetType?: string;
  daysAgo: number;
};

export const ACTIVITY_CATALOG: ActivitySeed[] = [
  { action: "course.publish", targetType: "Course", daysAgo: 30 },
  { action: "course.publish", targetType: "Course", daysAgo: 28 },
  { action: "enrollment.create", targetType: "Enrollment", daysAgo: 25 },
  { action: "enrollment.create", targetType: "Enrollment", daysAgo: 24 },
  { action: "assignment.publish", targetType: "Assignment", daysAgo: 10 },
  { action: "submission.create", targetType: "Submission", daysAgo: 6 },
  { action: "grade.create", targetType: "Grade", daysAgo: 4 },
  { action: "certificate.award", targetType: "CertificateAward", daysAgo: 5 },
  { action: "message.send", targetType: "Message", daysAgo: 5 },
  { action: "fee.create", targetType: "Fee", daysAgo: 20 },
];

export type AssignmentSeed = {
  courseSlug: string;
  title: string;
  description: string;
  type: "TEXT" | "LINK";
  dueInDays: number;
  submit?: { text: string; grade?: number };
};

export const ASSIGNMENT_CATALOG: AssignmentSeed[] = [
  {
    courseSlug: "intro-javascript",
    title: "Practice: format Nigerian phone numbers",
    description: "Write a function that normalises +234 and 080 formats to E.164.",
    type: "TEXT",
    dueInDays: 1,
  },
  {
    courseSlug: "biology-waec",
    title: "Lab report: osmosis in yam slices",
    description: "Write up your observations from the osmosis experiment using salt vs plain water.",
    type: "TEXT",
    dueInDays: 2,
  },
  {
    courseSlug: "intro-javascript",
    title: "Array methods exercise set",
    description: "Complete the 8 exercises on map, filter, and reduce using sample sales data in Naira.",
    type: "LINK",
    dueInDays: 4,
  },
  {
    courseSlug: "nigerian-history",
    title: "Essay: trans-Saharan trade and Kano",
    description: "800 words on how trans-Saharan trade shaped Kano's economy and culture.",
    type: "TEXT",
    dueInDays: 5,
  },
  {
    courseSlug: "statistics-sme",
    title: "Problem set: weekly revenue charts",
    description: "Plot and interpret a month of fictional shop sales; calculate mean and range.",
    type: "TEXT",
    dueInDays: 8,
  },
  {
    courseSlug: "graphic-design-social",
    title: "Peer review: Instagram promo critique",
    description: "Critique two classmates' promo drafts for a Lagos food vendor.",
    type: "TEXT",
    dueInDays: -4,
    submit: {
      text: "Reviewed both drafts — strong colour on the jollof post; second needs better text hierarchy and price visibility.",
      grade: 97,
    },
  },
  {
    courseSlug: "public-speaking-grads",
    title: "Reflection: mock interview performance",
    description: "Reflect on your mock interview: pacing, clarity, and handling tough questions.",
    type: "TEXT",
    dueInDays: -7,
    submit: {
      text: "My opening improved; I still rush when asked about salary expectations. Will practise pausing.",
      grade: 83,
    },
  },
];

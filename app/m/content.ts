import type { IconName } from "@/components/icon";

/**
 * Landing-page copy. Kept apart from the page so the visible FAQ and the
 * FAQPage JSON-LD read the same strings (structured data must describe what
 * the visitor can see).
 */

export type Pillar = {
  id: string;
  icon: IconName;
  color: string;
  title: string;
  body: string;
  bullets: string[];
};

export const PILLARS: Pillar[] = [
  {
    id: "teach",
    icon: "book",
    color: "var(--chart-1)",
    title: "Teach",
    body: "Build courses and programmes from lessons, video and files.",
    bullets: [
      "Courses, programmes and a shared media library",
      "In-lesson quizzes with hints, pass marks and read-up links",
      "Assignments with grading and written feedback",
      "Progress tracking for every learner",
    ],
  },
  {
    id: "assess",
    icon: "clipboard",
    color: "var(--chart-2)",
    title: "Assess",
    body: "Run timed computer-based tests with real exam controls.",
    bullets: [
      "16 question types, including maths, matching and file upload",
      "Question banks, sections and randomised papers",
      "Lockdown with strikes, auto-submit and Safe Exam Browser",
      "Results analytics and scheduled result release",
    ],
  },
  {
    id: "certify",
    icon: "award",
    color: "var(--chart-3)",
    title: "Certify",
    body: "Issue certificates the moment learners finish.",
    bullets: [
      "Certificate templates in your brand",
      "An AI-assisted certificate editor",
      "Issued automatically on completion",
    ],
  },
  {
    id: "publish",
    icon: "globe",
    color: "var(--chart-4)",
    title: "Publish",
    body: "Give your academy a public website without a web developer.",
    bullets: [
      "Website builder with AI, sections and a code editor",
      "Public course and programme pages",
      "Page titles, descriptions and share images you control",
    ],
  },
  {
    id: "sell",
    icon: "wallet",
    color: "var(--chart-5)",
    title: "Sell",
    body: "Take payment for courses and fees online.",
    bullets: [
      "Monnify, Paystack and Flutterwave checkout",
      "Course payments, fees and receipts",
      "Staff referral codes that track who brought each sale",
    ],
  },
  {
    id: "manage",
    icon: "users",
    color: "var(--chart-1)",
    title: "Manage",
    body: "Run the whole organization from one admin console.",
    bullets: [
      "Learners, staff, groups and clients",
      "Roles and role templates, down to each permission",
      "Calendar, messages, notifications and an activity log",
    ],
  },
];

export const EXAM_POINTS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "lock",
    title: "Lockdown that holds",
    body: "Fullscreen is enforced. Leaving the exam earns a strike, and too many strikes submit the paper. You can also require Safe Exam Browser.",
  },
  {
    icon: "refresh",
    title: "Network drops don't lose answers",
    body: "Answers save on the device and sync when the connection returns, so a dropped Wi-Fi signal never costs a candidate their work.",
  },
  {
    icon: "user-check",
    title: "Candidates without accounts",
    body: "Enrolled learners sit exams from their portal. External candidates sign in with an Exam ID and PIN.",
  },
  {
    icon: "chart",
    title: "Marking and analytics",
    body: "Objective questions mark themselves and essays get AI marking against your rubric. Item analysis shows which questions worked.",
  },
];

export const SITE_POINTS: string[] = [
  "Describe your academy and AI drafts the page",
  "Reorder, hide and edit sections without touching code",
  "Open the code editor when you want full control",
  "Course pages link straight to enrollment and checkout",
];

export type Integration = { name: string; icon: IconName; kind: string };

/** Mirrors lib/integrations/registry.ts — keep in step when a connector is added. */
export const INTEGRATIONS: Integration[] = [
  { name: "Slack", icon: "share", kind: "Alerts" },
  { name: "Microsoft Teams", icon: "share", kind: "Alerts" },
  { name: "Discord", icon: "share", kind: "Alerts" },
  { name: "Google Chat", icon: "share", kind: "Alerts" },
  { name: "Zoom", icon: "video", kind: "Live classes" },
  { name: "Calendar feeds", icon: "calendar", kind: "iCal sync" },
  { name: "Google Workspace", icon: "shield", kind: "Single sign-on" },
  { name: "Microsoft Entra ID", icon: "shield", kind: "Single sign-on" },
  { name: "Any OpenID Connect", icon: "shield", kind: "Single sign-on" },
  { name: "Automation tools", icon: "link", kind: "Webhooks" },
];

export const WEBHOOK_EVENTS = [
  "enrollment.completed",
  "exam.result.released",
  "certificate.issued",
  "payment.succeeded",
] as const;

export const PORTALS: {
  icon: IconName;
  color: string;
  title: string;
  body: string;
  bullets: string[];
}[] = [
  {
    icon: "settings",
    color: "var(--chart-1)",
    title: "Admin console",
    body: "Your staff run courses, exams, the website and billing from one place.",
    bullets: [
      "Courses, programmes, question banks and media",
      "Exams, invigilators, grading and certificates",
      "Website, payments, fees and referrals",
      "Roles, integrations and developer keys",
    ],
  },
  {
    icon: "cap",
    color: "var(--chart-2)",
    title: "Learner portal",
    body: "Learners sign in on your academy's address to study, sit exams and track progress.",
    bullets: [
      "Browse the catalog, enroll and pay",
      "Lessons, quizzes, assignments and exams",
      "Grades, certificates and their own profile",
      "Calendar, messages and notifications",
    ],
  },
];

export const STEPS: { color: string; title: string; body: string }[] = [
  {
    color: "var(--chart-1)",
    title: "Create your academy",
    body: "Register your organization. You get your own address with an admin console and a learner portal.",
  },
  {
    color: "var(--chart-2)",
    title: "Add courses and exams",
    body: "Build lessons and question banks, set up payments and publish your website.",
  },
  {
    color: "var(--chart-3)",
    title: "Enroll learners",
    body: "Invite learners or let them sign up and pay, then follow their progress and results.",
  },
];

export type Faq = { q: string; a: string };

export function buildFaqs(trialDays: number, apexHost: string): Faq[] {
  return [
    {
      q: "How long is the free trial?",
      a: `${trialDays} days, with storage included. You don't need a card to start.`,
    },
    {
      q: "Where do my learners sign in?",
      a: `Each academy gets its own address, such as youracademy.${apexHost}. Your website, learner portal and admin console all live there, in your brand.`,
    },
    {
      q: "Can I run proctored CBT exams?",
      a: "Yes. Exams run fullscreen with strike limits and auto-submit, and you can require Safe Exam Browser. Answers save on the device, so a network drop doesn't lose work.",
    },
    {
      q: "Can people without an account sit an exam?",
      a: "Yes. Issue external candidates an Exam ID and PIN. Enrolled learners sit the same exam from their portal.",
    },
    {
      q: "Which payment providers are supported?",
      a: "Monnify, Paystack and Flutterwave. Learners can pay for courses and fees online, and you see every payment in the admin console.",
    },
    {
      q: "Can I connect my own systems?",
      a: "Yes. The Developer API covers learners, enrollments, courses, exams, payments and certificates, and signed webhooks notify your systems when things happen. Single sign-on works with Google Workspace, Microsoft Entra ID or any OpenID Connect provider.",
    },
    {
      q: "Do I need a web developer to build my academy's website?",
      a: "No. The website builder drafts pages with AI and lets you edit them section by section. A code editor is there if you want it.",
    },
  ];
}

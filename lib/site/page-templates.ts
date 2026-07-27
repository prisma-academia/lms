import { newBlockId, type SiteBlock } from "@/lib/site/blocks";

export type PageTemplateId = "classic" | "minimal" | "catalog";

export type PageTemplate = {
  id: PageTemplateId;
  name: string;
  description: string;
  blocks: () => SiteBlock[];
};

function classicBlocks(): SiteBlock[] {
  return [
    {
      type: "hero",
      id: newBlockId(),
      headline: undefined,
      subcopy:
        "Welcome to your learning home. Enroll in courses, track your progress, and grow with us.",
      showLogo: true,
      showLocation: true,
      ctas: [
        { label: "Enroll now", href: "/auth/register", variant: "primary" },
        { label: "Sign in", href: "/auth/login", variant: "outline" },
        { label: "View courses", href: "#courses", variant: "secondary" },
      ],
    },
    {
      type: "about",
      id: newBlockId(),
      title: "About us",
      showContact: true,
    },
    {
      type: "benefits",
      id: newBlockId(),
      title: "Why learn with us",
      items: [
        {
          title: "Structured courses",
          body: "Clear lessons, quizzes, and progress tracking so you always know what’s next.",
          icon: "book",
        },
        {
          title: "Learn anywhere",
          body: "Access your courses from any device — pick up right where you left off.",
          icon: "globe",
        },
        {
          title: "Certificates",
          body: "Earn recognition when you complete programmes and demonstrate mastery.",
          icon: "award",
        },
      ],
    },
    {
      type: "courses",
      id: newBlockId(),
      title: "Featured courses",
      limit: 6,
    },
    {
      type: "steps",
      id: newBlockId(),
      title: "How it works",
      items: [
        { title: "Create an account", body: "Register in minutes and join our learning community." },
        { title: "Enroll in a course", body: "Browse the catalog and start learning right away." },
        { title: "Track your progress", body: "Complete lessons, submit work, and earn certificates." },
      ],
      ctaLabel: "Get started",
      ctaHref: "/auth/register",
    },
  ];
}

function minimalBlocks(): SiteBlock[] {
  return [
    {
      type: "hero",
      id: newBlockId(),
      subcopy: "Explore our courses and start learning today.",
      showLogo: true,
      showLocation: false,
      ctas: [
        { label: "Enroll now", href: "/auth/register", variant: "primary" },
        { label: "Sign in", href: "/auth/login", variant: "outline" },
      ],
    },
    {
      type: "courses",
      id: newBlockId(),
      title: "Courses",
      limit: 12,
    },
    {
      type: "cta",
      id: newBlockId(),
      headline: "Ready to begin?",
      subcopy: "Create your account and enroll in minutes.",
      ctas: [{ label: "Enroll now", href: "/auth/register", variant: "primary" }],
    },
  ];
}

function catalogBlocks(): SiteBlock[] {
  return [
    {
      type: "hero",
      id: newBlockId(),
      subcopy: "Browse our full catalog of public courses.",
      showLogo: true,
      showLocation: true,
      ctas: [
        { label: "View courses", href: "#courses", variant: "primary" },
        { label: "Sign in", href: "/auth/login", variant: "outline" },
      ],
    },
    {
      type: "courses",
      id: newBlockId(),
      title: "Course catalog",
      limit: 24,
    },
    {
      type: "faq",
      id: newBlockId(),
      title: "Frequently asked questions",
      items: [
        {
          question: "How do I enroll?",
          answer: "Create an account, then open any course and follow the enrollment steps.",
        },
        {
          question: "Are courses free?",
          answer: "Some courses are free; paid courses show their price on the course card.",
        },
      ],
    },
  ];
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Hero, about, benefits, courses, and steps — matches the default landing.",
    blocks: classicBlocks,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Hero, courses grid, and a closing call to action.",
    blocks: minimalBlocks,
  },
  {
    id: "catalog",
    name: "Catalog",
    description: "Large course grid with FAQ — catalog-first presence.",
    blocks: catalogBlocks,
  },
];

export function getPageTemplate(id: string): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}

export function classicHomeBlocks(): SiteBlock[] {
  return classicBlocks();
}

import { textLesson, type LessonSeed } from "../factories/lesson";

export type LessonGroupSeed = {
  title: string;
  lessons: LessonSeed[];
};

export type CourseSeed = {
  title: string;
  slug: string;
  description: string;
  /** Flat lessons (no groups). */
  lessons?: LessonSeed[];
  /** Grouped lessons — at least one course should use this. */
  groups?: LessonGroupSeed[];
  completedLessons: number;
  completed?: boolean;
  /** If true, demo student is NOT enrolled (catalog demo). */
  catalogOnly?: boolean;
};

function biologyLessons(): LessonGroupSeed[] {
  return [
    {
      title: "Cell Biology",
      lessons: [
        textLesson(
          "What is a cell?",
          "Every living thing — from the yam in your market stall to the cells in your own body — is built from cells.\n\nIn WAEC Biology, you must know the difference between plant and animal cells, and be able to label the nucleus, cytoplasm, and cell membrane.\n\nTry sketching a simple cell diagram before your next class.",
          0
        ),
        textLesson(
          "The plasma membrane",
          "The plasma membrane controls what enters and leaves a cell — like a security gate at a Lagos office block.\n\nKey terms: selective permeability, osmosis, diffusion. WAEC often asks you to explain why red blood cells burst in distilled water.",
          1
        ),
        textLesson(
          "Diffusion basics",
          "Diffusion is the movement of particles from high to low concentration — no energy required.\n\nThink of perfume spreading across a room in Surulere, or nutrients moving into a root hair cell. Practice explaining this in your own words.",
          2
        ),
        textLesson(
          "Osmosis & diffusion",
          "Osmosis is diffusion of water through a partially permeable membrane.\n\nThe potato-osmosis experiment is a WAEC favourite. Record what happens in salt water vs plain water, and link it to how farmers manage soil salinity in the Niger Delta.",
          3
        ),
      ],
    },
    {
      title: "Body Systems",
      lessons: [
        textLesson(
          "Cellular respiration",
          "Cells release energy from glucose through respiration — aerobic (with oxygen) and anaerobic (without).\n\nAthletes in Abuja marathons rely on efficient respiration. Know the word equation and where it happens in the cell.",
          4
        ),
        textLesson(
          "Photosynthesis",
          "Plants make food using sunlight, carbon dioxide, and water. Nigeria's agriculture depends on healthy photosynthesis in cassava, maize, and rice.\n\nMemorise the balanced equation and the role of chlorophyll.",
          5
        ),
      ],
    },
  ];
}

export const COURSE_CATALOG: CourseSeed[] = [
  {
    title: "Biology for WAEC",
    slug: "biology-waec",
    description:
      "Cells, body systems, and exam-ready biology — aligned with WAEC syllabus topics.",
    groups: biologyLessons(),
    completedLessons: 4,
  },
  {
    title: "Intro to JavaScript",
    slug: "intro-javascript",
    description:
      "Build your first web apps — variables, functions, and DOM basics for Nigerian freelancers.",
    lessons: [
      textLesson(
        "Variables & types",
        "JavaScript stores data in variables. A Lagos freelancer might track prices in Naira:\n\n`let lessonFee = 5000;`\n\nLearn `let`, `const`, strings, numbers, and booleans.",
        0
      ),
      textLesson(
        "Functions",
        "Functions bundle reusable logic — like a function that formats phone numbers for Nigerian networks (+234).\n\nPractice writing functions with parameters and return values.",
        1
      ),
      textLesson(
        "Conditionals",
        "Use `if/else` to branch your code — e.g. apply a discount if payment is in Naira vs USD.\n\nTry the exercises before moving on.",
        2
      ),
      textLesson(
        "Loops",
        "`for` and `while` loops repeat work — useful for rendering a list of products on a small business site.",
        3
      ),
      textLesson(
        "Array methods",
        "`.map()`, `.filter()`, and `.reduce()` transform lists of data — core skills for any dev interview in Lagos or remote.",
        4
      ),
      textLesson(
        "Working with objects",
        "Objects group related fields — a `student` object might have `name`, `state`, and `waecSubjects[]`.",
        5
      ),
    ],
    completedLessons: 3,
  },
  {
    title: "Nigerian History & Civics",
    slug: "nigerian-history",
    description:
      "From pre-colonial kingdoms to independence and modern Nigeria — context for civic life.",
    lessons: [
      textLesson(
        "Pre-colonial kingdoms",
        "Benin, Oyo, Kanem-Bornu, and the Hausa city-states shaped trade and governance long before colonisation.\n\nKnow key rulers and economic activities.",
        0
      ),
      textLesson(
        "Trans-Saharan trade",
        "Gold, salt, and kola moved across the Sahel, linking West Africa to North Africa and beyond.\n\nHow did this trade change cities like Kano and Timbuktu?",
        1
      ),
      textLesson(
        "Colonial era",
        "British amalgamation in 1914 created modern Nigeria's borders. Understand indirect rule and its effects on local chiefs and taxation.",
        2
      ),
      textLesson(
        "Road to independence",
        "Herbert Macaulay, Nnamdi Azikiwe, Obafemi Awolowo, and others led the nationalist movement. Independence came on 1 October 1960.",
        3
      ),
      textLesson(
        "Civil war & reconciliation",
        "The 1967–1970 conflict and its aftermath shaped Nigeria's federal structure. Study causes and lessons for unity today.",
        4
      ),
      textLesson(
        "Modern Nigeria",
        "Democracy since 1999, federalism, and the role of states and LGAs. How do citizens participate — voting, advocacy, community action?",
        5
      ),
    ],
    completedLessons: 5,
  },
  {
    title: "Statistics for Small Business",
    slug: "statistics-sme",
    description:
      "Make sense of sales data, costs in Naira, and simple forecasts for your hustle or shop.",
    lessons: [
      textLesson(
        "Describing data",
        "Your POS app exports daily sales — mean, median, and mode tell different stories about a busy Friday in Onitsha market.",
        0
      ),
      textLesson(
        "Measures of spread",
        "Range and standard deviation show how consistent your revenue is week to week.",
        1
      ),
      textLesson(
        "Probability basics",
        "If 3 in 10 customers return, what's the chance the next two both return? Practice with Nigerian business scenarios.",
        2
      ),
      textLesson(
        "Charts that matter",
        "Bar charts for product categories, line charts for monthly Naira revenue — pick the right visual for your stakeholders.",
        3
      ),
      textLesson(
        "Sampling customers",
        "You can't survey every buyer — learn simple random sampling for feedback forms at your shop.",
        4
      ),
      textLesson(
        "Simple forecasts",
        "Use past sales to estimate next month's stock needs. Avoid over-ordering perishables before a public holiday.",
        5
      ),
    ],
    completedLessons: 2,
  },
  {
    title: "Graphic Design for Social Media",
    slug: "graphic-design-social",
    description:
      "Type, colour, and layouts for Instagram, WhatsApp promos, and small-brand visuals.",
    lessons: [
      textLesson(
        "Design principles",
        "Contrast, alignment, repetition, proximity — the CRAP principles apply whether you're designing for a Lagos boutique or a church flyer.",
        0
      ),
      textLesson(
        "Typography",
        "Pair a bold headline font with a clean body font. Avoid using more than two families on one promo.",
        1
      ),
      textLesson(
        "Colour theory",
        "Green and white evoke Nigeria; warm oranges suit food brands. Build a 3-colour palette for a fictional client.",
        2
      ),
      textLesson(
        "Grids & layout",
        "Use a 1080×1080 grid for Instagram posts. Keep logos and prices in safe zones.",
        3
      ),
      textLesson(
        "Logo design basics",
        "Sketch three concepts for a fictional suya spot in Abuja. Focus on simplicity and readability at small sizes.",
        4
      ),
    ],
    completedLessons: 5,
    completed: true,
  },
  {
    title: "Public Speaking for Graduates",
    slug: "public-speaking-grads",
    description:
      "Present with confidence — interviews, pitches, and campus debates.",
    lessons: [
      textLesson(
        "Overcoming nerves",
        "Even TED speakers in Lagos feel butterflies. Breathing exercises and rehearsal reduce anxiety before NYSC presentations.",
        0
      ),
      textLesson(
        "Structuring a talk",
        "Opening hook, three main points, memorable close — use this for job interviews and startup pitches.",
        1
      ),
      textLesson(
        "Delivery & presence",
        "Eye contact, pace, and pauses matter more than perfect grammar. Record yourself on your phone and review.",
        2
      ),
      textLesson(
        "Handling Q&A",
        "Repeat the question, buy time with 'That's a great point', and answer honestly when you don't know.",
        3
      ),
      textLesson(
        "Storytelling",
        "Wrap data in story — 'Last month in Ibadan, a client...' — to make technical talks memorable.",
        4
      ),
    ],
    completedLessons: 3,
  },
  {
    title: "Digital Marketing Basics",
    slug: "digital-marketing-basics",
    description:
      "Reach customers online — social ads, email, and WhatsApp Business for Nigerian SMEs.",
    lessons: [
      textLesson(
        "Know your audience",
        "Define who buys from you — age, location (Lagos vs PH), and pain points — before spending on ads.",
        0
      ),
      textLesson(
        "Social media channels",
        "Instagram and TikTok for visuals; X for news; WhatsApp for direct sales. Pick 1–2 channels first.",
        1
      ),
      textLesson(
        "Content calendar",
        "Plan a week of posts: promo, testimonial, behind-the-scenes. Consistency beats viral one-offs.",
        2
      ),
      textLesson(
        "Paid ads on a budget",
        "Start with ₦5,000–₦10,000 test campaigns. Track clicks and cost per lead before scaling.",
        3
      ),
      textLesson(
        "Email & WhatsApp lists",
        "Build a list with consent. Send value — tips, not just sales — to keep subscribers in Nigeria's crowded inboxes.",
        4
      ),
    ],
    completedLessons: 0,
    catalogOnly: true,
  },
];

/** Courses the demo student should be enrolled in. */
export function enrolledCourses(): CourseSeed[] {
  return COURSE_CATALOG.filter((c) => !c.catalogOnly);
}

export function catalogOnlyCourses(): CourseSeed[] {
  return COURSE_CATALOG.filter((c) => c.catalogOnly);
}

export function lessonCount(course: CourseSeed): number {
  if (course.lessons) return course.lessons.length;
  if (course.groups) return course.groups.reduce((n, g) => n + g.lessons.length, 0);
  return 0;
}

export function flatLessons(course: CourseSeed): LessonSeed[] {
  if (course.lessons) return course.lessons;
  if (course.groups) return course.groups.flatMap((g) => g.lessons);
  return [];
}

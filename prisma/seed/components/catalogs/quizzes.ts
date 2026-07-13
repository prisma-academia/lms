export type QuestionSeed = {
  type: "SINGLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_CHOICE" | "SHORT_ANSWER";
  prompt: string;
  /** Choice options (empty for SHORT_ANSWER). For TRUE_FALSE use ["True","False"]. */
  options: string[];
  /**
   * The correct answer(s) as option TEXT (for choice questions) or accepted
   * string(s) (for SHORT_ANSWER). The seed converts choice text to option
   * indices, which is what the scorer (`lib/assessments/scoring.ts`) expects.
   */
  answer: string | string[];
  points?: number;
};

export type QuizSeed = {
  /** Course slug this quiz's QUIZ lesson is attached to. */
  courseSlug: string;
  bankName: string;
  bankDescription: string;
  quizTitle: string;
  quizDescription: string;
  lessonTitle: string;
  passingScore: number;
  timeLimitMin: number;
  /** Demo student's seeded attempt for this quiz. */
  attempt: { scorePercent: number; passed: boolean };
  questions: QuestionSeed[];
};

export const QUIZ_CATALOG: QuizSeed[] = [
  {
    courseSlug: "biology-waec",
    bankName: "WAEC Biology — Cell Structure",
    bankDescription: "Practice questions aligned with WAEC Biology Paper 2.",
    quizTitle: "Cell structure checkpoint",
    quizDescription: "Quick check before the osmosis lab — 6 questions.",
    lessonTitle: "Cell structure quiz",
    passingScore: 70,
    timeLimitMin: 15,
    attempt: { scorePercent: 83, passed: true },
    questions: [
      {
        type: "SINGLE_CHOICE",
        prompt: "Which organelle is responsible for protein synthesis in animal cells?",
        options: ["Mitochondria", "Ribosome", "Golgi body", "Lysosome"],
        answer: "Ribosome",
        points: 1,
      },
      {
        type: "TRUE_FALSE",
        prompt: "Plant cells have a cell wall made mainly of cellulose.",
        options: ["True", "False"],
        answer: "True",
        points: 1,
      },
      {
        type: "SINGLE_CHOICE",
        prompt: "Osmosis is the diffusion of which substance?",
        options: ["Oxygen", "Carbon dioxide", "Water", "Glucose"],
        answer: "Water",
        points: 1,
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which of these are found in a typical plant cell? (Select all that apply.)",
        options: ["Chloroplast", "Cell wall", "Centriole (typical)", "Large vacuole"],
        answer: ["Chloroplast", "Cell wall", "Large vacuole"],
        points: 2,
      },
      {
        type: "SHORT_ANSWER",
        prompt: "Name the organelle known as the 'powerhouse of the cell'.",
        options: [],
        answer: ["mitochondrion", "mitochondria"],
        points: 1,
      },
      {
        type: "TRUE_FALSE",
        prompt: "The nucleus controls the activities of the cell.",
        options: ["True", "False"],
        answer: "True",
        points: 1,
      },
    ],
  },
  {
    courseSlug: "intro-javascript",
    bankName: "JavaScript Fundamentals",
    bankDescription: "Checkpoint questions on variables, functions, and arrays.",
    quizTitle: "JavaScript basics checkpoint",
    quizDescription: "Confirm the fundamentals before the DOM section — 5 questions.",
    lessonTitle: "JavaScript basics quiz",
    passingScore: 60,
    timeLimitMin: 12,
    attempt: { scorePercent: 80, passed: true },
    questions: [
      {
        type: "SINGLE_CHOICE",
        prompt: "Which keyword declares a variable that cannot be reassigned?",
        options: ["var", "let", "const", "static"],
        answer: "const",
        points: 1,
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which of these are primitive types in JavaScript? (Select all that apply.)",
        options: ["string", "number", "array", "boolean"],
        answer: ["string", "number", "boolean"],
        points: 2,
      },
      {
        type: "TRUE_FALSE",
        prompt: "`===` compares both value and type.",
        options: ["True", "False"],
        answer: "True",
        points: 1,
      },
      {
        type: "SHORT_ANSWER",
        prompt: "Which array method transforms each element and returns a new array?",
        options: [],
        answer: ["map", ".map", "map()"],
        points: 1,
      },
      {
        type: "SINGLE_CHOICE",
        prompt: "What does a function `return` do when reached?",
        options: [
          "Logs to the console",
          "Ends the function and yields a value",
          "Loops again",
          "Declares a variable",
        ],
        answer: "Ends the function and yields a value",
        points: 1,
      },
    ],
  },
  {
    courseSlug: "statistics-sme",
    bankName: "Business Statistics",
    bankDescription: "Descriptive statistics for small-business decisions.",
    quizTitle: "Describing data checkpoint",
    quizDescription: "A quick check on averages and spread — 4 questions.",
    lessonTitle: "Describing data quiz",
    passingScore: 50,
    timeLimitMin: 10,
    attempt: { scorePercent: 75, passed: true },
    questions: [
      {
        type: "SINGLE_CHOICE",
        prompt: "Which measure is most affected by a single very large sale?",
        options: ["Mean", "Median", "Mode", "Range"],
        answer: "Mean",
        points: 1,
      },
      {
        type: "SHORT_ANSWER",
        prompt: "What is the middle value of an ordered dataset called?",
        options: [],
        answer: ["median"],
        points: 1,
      },
      {
        type: "MULTIPLE_CHOICE",
        prompt: "Which of these describe the SPREAD of data? (Select all that apply.)",
        options: ["Range", "Mean", "Standard deviation", "Mode"],
        answer: ["Range", "Standard deviation"],
        points: 2,
      },
      {
        type: "TRUE_FALSE",
        prompt: "A larger standard deviation means the data is more consistent.",
        options: ["True", "False"],
        answer: "False",
        points: 1,
      },
    ],
  },
];

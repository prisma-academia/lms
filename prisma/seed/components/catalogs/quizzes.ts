export type QuestionSeed = {
  type: "SINGLE_CHOICE" | "TRUE_FALSE" | "MULTIPLE_CHOICE";
  prompt: string;
  options: string[];
  answer: string | string[];
  points?: number;
};

export const QUIZ_CATALOG = {
  bankName: "WAEC Biology — Cell Structure",
  bankDescription: "Practice questions aligned with WAEC Biology Paper 2.",
  quizTitle: "Cell structure checkpoint",
  quizDescription: "Quick check before the osmosis lab — 5 questions.",
  questions: [
    {
      type: "SINGLE_CHOICE" as const,
      prompt: "Which organelle is responsible for protein synthesis in animal cells?",
      options: ["Mitochondria", "Ribosome", "Golgi body", "Lysosome"],
      answer: "Ribosome",
      points: 1,
    },
    {
      type: "TRUE_FALSE" as const,
      prompt: "Plant cells have a cell wall made mainly of cellulose.",
      options: ["True", "False"],
      answer: "True",
      points: 1,
    },
    {
      type: "SINGLE_CHOICE" as const,
      prompt: "Osmosis is the diffusion of which substance?",
      options: ["Oxygen", "Carbon dioxide", "Water", "Glucose"],
      answer: "Water",
      points: 1,
    },
    {
      type: "SINGLE_CHOICE" as const,
      prompt: "A red blood cell placed in distilled water will most likely:",
      options: ["Shrink", "Burst", "Stay the same", "Turn green"],
      answer: "Burst",
      points: 2,
    },
    {
      type: "TRUE_FALSE" as const,
      prompt: "The nucleus controls the activities of the cell.",
      options: ["True", "False"],
      answer: "True",
      points: 1,
    },
    {
      type: "SINGLE_CHOICE" as const,
      prompt: "Which structure controls what enters and leaves the cell?",
      options: ["Cell wall", "Plasma membrane", "Vacuole", "Chloroplast"],
      answer: "Plasma membrane",
      points: 1,
    },
  ] satisfies QuestionSeed[],
};

export type LessonSeed = {
  title: string;
  body: string;
  durationMin: number;
  contentType?: "TEXT" | "QUIZ" | "VIDEO_URL";
  quizId?: string;
};

export function textLesson(
  title: string,
  body: string,
  index: number
): LessonSeed {
  return {
    title,
    body,
    durationMin: 8 + ((index * 3) % 14),
    contentType: "TEXT",
  };
}

export function quizLesson(title: string, quizId: string, index: number): LessonSeed {
  return {
    title,
    body: `${title}\n\nComplete this quiz to check your understanding before moving on.`,
    durationMin: 10 + (index % 5),
    contentType: "QUIZ",
    quizId,
  };
}

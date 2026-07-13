export type LessonSeed = {
  title: string;
  body: string;
  durationMin: number;
  contentType?: "TEXT" | "QUIZ" | "VIDEO_URL";
  quizId?: string;
  /** Video source URL (for VIDEO_URL lessons). */
  url?: string;
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

export function videoLesson(
  title: string,
  url: string,
  index: number,
  body = ""
): LessonSeed {
  return {
    title,
    body,
    durationMin: 6 + ((index * 4) % 12),
    contentType: "VIDEO_URL",
    url,
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

/**
 * Public, royalty-free sample MP4s (Google's GTV demo bucket) — used so seeded
 * VIDEO_URL lessons actually play in the learn player's <video> element.
 */
export const SAMPLE_VIDEOS = {
  bunny:
    "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  elephants:
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  blazes:
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  escapes:
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
} as const;

export type ScorableQuestion = {
  id: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  answerJson: unknown;
  points: number;
};

/** A learner's response for one question: selected option indices, or text. */
export type Response = number[] | string | undefined;

export function isCorrect(q: ScorableQuestion, response: Response): boolean {
  const answer = Array.isArray(q.answerJson) ? q.answerJson : [];
  switch (q.type) {
    case "SINGLE_CHOICE":
    case "TRUE_FALSE": {
      const correct = answer[0];
      const resp = Array.isArray(response) ? response[0] : undefined;
      return resp !== undefined && resp === correct;
    }
    case "MULTIPLE_CHOICE": {
      const correctSet = new Set(answer as number[]);
      const respArr = Array.isArray(response) ? response : [];
      const respSet = new Set(respArr);
      return correctSet.size === respSet.size && [...correctSet].every((x) => respSet.has(x));
    }
    case "SHORT_ANSWER": {
      const accept = (answer as string[]).map((s) => String(s).trim().toLowerCase());
      const resp = typeof response === "string" ? response.trim().toLowerCase() : "";
      return resp !== "" && accept.includes(resp);
    }
    default:
      return false;
  }
}

/** Score an attempt. `effectivePoints` overrides a question's own points. */
export function scoreAttempt(
  questions: (ScorableQuestion & { effectivePoints: number })[],
  answers: Record<string, Response>
): { scorePercent: number; earned: number; total: number; perQuestion: Record<string, boolean> } {
  let earned = 0;
  let total = 0;
  const perQuestion: Record<string, boolean> = {};
  for (const q of questions) {
    total += q.effectivePoints;
    const ok = isCorrect(q, answers[q.id]);
    perQuestion[q.id] = ok;
    if (ok) earned += q.effectivePoints;
  }
  const scorePercent = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { scorePercent, earned, total, perQuestion };
}

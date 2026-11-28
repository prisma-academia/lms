"use client";

import { createContext, useContext } from "react";
import type { CandidateRow, ExamDetail } from "@/lib/exams/admin-dto";

export type Option = { id: string; name: string };

export type BuilderLookups = {
  banks: (Option & { questionCount: number })[];
  tags: Option[];
  courses: Option[];
  certificates: Option[];
  groups: (Option & { members: number })[];
};

export type BuilderContextValue = BuilderLookups & {
  exam: ExamDetail;
  /** Re-read the exam from the server (after a mutation). */
  reload: () => Promise<void>;
  /** Optimistic local change; follow with reload() once the server agrees. */
  setExam: (update: (prev: ExamDetail) => ExamDetail) => void;
  candidates: CandidateRow[];
  reloadCandidates: () => Promise<void>;
  canWrite: boolean;
  canProctor: boolean;
  canGrade: boolean;
  /** Attempts exist: the paper can no longer change. */
  paperLocked: boolean;
  timeZone: string;
  /** The academy's public origin, e.g. https://acme.prismalms.com */
  origin: string;
  goToTab: (tab: BuilderTab) => void;
};

export type BuilderTab = "overview" | "paper" | "settings" | "security" | "candidates" | "sittings" | "preview";

export const BuilderContext = createContext<BuilderContextValue | null>(null);

export function useBuilder(): BuilderContextValue {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used inside the exam builder");
  return ctx;
}

import type { z } from "zod";
import type * as S from "./schemas";

/**
 * DB rows → API objects. The API says "learner" and "group" where the schema
 * says Client and ClientGroup, and dates are ISO strings.
 */

type Out<T extends z.ZodType> = z.infer<T>;

const d = (v: Date | null | undefined): string | null => (v ? v.toISOString() : null);
const dd = (v: Date): string => v.toISOString();

export function learner(c: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  otherName: string | null;
  phone: string | null;
  status: "ACTIVE" | "SUSPENDED";
  externalId: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}): Out<typeof S.Learner> {
  return {
    id: c.id,
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    otherName: c.otherName,
    phone: c.phone,
    status: c.status,
    externalId: c.externalId,
    createdAt: dd(c.createdAt),
    lastLoginAt: d(c.lastLoginAt),
  };
}

export function group(g: {
  id: string;
  name: string;
  description: string | null;
  externalId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { memberships: number };
}): Out<typeof S.Group> {
  return {
    id: g.id,
    name: g.name,
    description: g.description,
    externalId: g.externalId,
    ...(g._count ? { memberCount: g._count.memberships } : {}),
    createdAt: dd(g.createdAt),
    updatedAt: dd(g.updatedAt),
  };
}

export function course(c: {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  visibility: string;
  priceCents: number | null;
  currency: string;
  externalId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Out<typeof S.Course> {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    description: c.description,
    status: c.status,
    visibility: c.visibility,
    priceCents: c.priceCents,
    currency: c.currency,
    externalId: c.externalId,
    publishedAt: d(c.publishedAt),
    createdAt: dd(c.createdAt),
    updatedAt: dd(c.updatedAt),
  };
}

export function programme(
  p: {
    id: string;
    title: string;
    slug: string;
    description: string | null;
    status: string;
    visibility: string;
    priceCents: number | null;
    currency: string;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  },
  courses?: Array<{ courseId: string; required: boolean; sortOrder: number; groupLabel: string | null }>
): Out<typeof S.Programme> {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    status: p.status,
    visibility: p.visibility,
    priceCents: p.priceCents,
    currency: p.currency,
    publishedAt: d(p.publishedAt),
    createdAt: dd(p.createdAt),
    updatedAt: dd(p.updatedAt),
    ...(courses ? { courses } : {}),
  };
}

export function enrollment(e: {
  id: string;
  clientId: string;
  courseId: string;
  enrolledAt: Date;
  completedAt: Date | null;
  progressPercent: number;
}): Out<typeof S.Enrollment> {
  return {
    id: e.id,
    learnerId: e.clientId,
    courseId: e.courseId,
    enrolledAt: dd(e.enrolledAt),
    completedAt: d(e.completedAt),
    progressPercent: e.progressPercent,
  };
}

export function exam(e: {
  id: string;
  title: string;
  code: string | null;
  description: string | null;
  status: string;
  kind: string;
  courseId: string | null;
  durationMin: number;
  opensAt: Date | null;
  closesAt: Date | null;
  passMark: number;
  attemptsAllowed: number;
  resultRelease: string;
  accessMode: string;
  pinLogin: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Out<typeof S.Exam> {
  return {
    id: e.id,
    title: e.title,
    code: e.code,
    description: e.description,
    status: e.status,
    kind: e.kind,
    courseId: e.courseId,
    durationMin: e.durationMin,
    opensAt: d(e.opensAt),
    closesAt: d(e.closesAt),
    passMark: e.passMark,
    attemptsAllowed: e.attemptsAllowed,
    resultRelease: e.resultRelease,
    accessMode: e.accessMode,
    pinLogin: e.pinLogin,
    publishedAt: d(e.publishedAt),
    createdAt: dd(e.createdAt),
    updatedAt: dd(e.updatedAt),
  };
}

export function sitting(s: {
  id: string;
  examId: string;
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
  venue: string | null;
  capacity: number | null;
  pausedAt: Date | null;
  createdAt: Date;
}): Out<typeof S.Sitting> {
  return {
    id: s.id,
    examId: s.examId,
    name: s.name,
    startsAt: d(s.startsAt),
    endsAt: d(s.endsAt),
    venue: s.venue,
    capacity: s.capacity,
    pausedAt: d(s.pausedAt),
    createdAt: dd(s.createdAt),
  };
}

export function candidate(c: {
  id: string;
  examId: string;
  clientId: string | null;
  fullName: string;
  email: string | null;
  regNumber: string | null;
  candidateNo: string;
  sittingId: string | null;
  extraTimePct: number;
  status: string;
  createdAt: Date;
}): Out<typeof S.Candidate> {
  return {
    id: c.id,
    examId: c.examId,
    learnerId: c.clientId,
    fullName: c.fullName,
    email: c.email,
    regNumber: c.regNumber,
    candidateNo: c.candidateNo,
    sittingId: c.sittingId,
    extraTimePct: c.extraTimePct,
    status: c.status,
    createdAt: dd(c.createdAt),
  };
}

export function examAttempt(a: {
  id: string;
  examId: string;
  candidateId: string;
  attemptNo: number;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  submitReason: string | null;
  scorePoints: number | null;
  maxPoints: number | null;
  scorePercent: number | null;
  passed: boolean | null;
  grade: string | null;
  gradingStatus: string | null;
  releasedAt: Date | null;
  violationCount: number;
  candidate: { clientId: string | null; candidateNo: string; fullName: string };
}): Out<typeof S.ExamAttempt> {
  return {
    id: a.id,
    examId: a.examId,
    candidateId: a.candidateId,
    learnerId: a.candidate.clientId,
    candidateNo: a.candidate.candidateNo,
    fullName: a.candidate.fullName,
    attemptNo: a.attemptNo,
    status: a.status,
    startedAt: dd(a.startedAt),
    submittedAt: d(a.submittedAt),
    submitReason: a.submitReason,
    scorePoints: a.scorePoints,
    maxPoints: a.maxPoints,
    scorePercent: a.scorePercent,
    passed: a.passed,
    grade: a.grade,
    gradingStatus: a.gradingStatus,
    releasedAt: d(a.releasedAt),
    violationCount: a.violationCount,
  };
}

export function quizAttempt(a: {
  id: string;
  quizId: string;
  clientId: string;
  startedAt: Date;
  submittedAt: Date | null;
  scorePercent: number | null;
  passed: boolean | null;
  gradingStatus: string;
}): Out<typeof S.QuizAttempt> {
  return {
    id: a.id,
    quizId: a.quizId,
    learnerId: a.clientId,
    startedAt: dd(a.startedAt),
    submittedAt: d(a.submittedAt),
    scorePercent: a.scorePercent,
    passed: a.passed,
    gradingStatus: a.gradingStatus,
  };
}

export function award(a: {
  id: string;
  certificateId: string;
  clientId: string;
  courseId: string | null;
  programmeId: string | null;
  serial: string;
  issuedAt: Date;
  certificate: { name: string };
}): Out<typeof S.CertificateAward> {
  return {
    id: a.id,
    certificateId: a.certificateId,
    certificateName: a.certificate.name,
    learnerId: a.clientId,
    courseId: a.courseId,
    programmeId: a.programmeId,
    serial: a.serial,
    issuedAt: dd(a.issuedAt),
  };
}

export function payment(
  type: "course" | "programme",
  p: {
    id: string;
    clientId: string;
    provider: string;
    amountCents: number;
    currency: string;
    status: string;
    externalRef: string;
    createdAt: Date;
    completedAt: Date | null;
    courseId?: string;
    programmeId?: string;
  }
): Out<typeof S.Payment> {
  return {
    id: p.id,
    type,
    itemId: (type === "course" ? p.courseId : p.programmeId) ?? "",
    learnerId: p.clientId,
    provider: p.provider,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    reference: p.externalRef,
    createdAt: dd(p.createdAt),
    completedAt: d(p.completedAt),
  };
}

export function fee(f: {
  id: string;
  name: string;
  description: string | null;
  amountCents: number;
  currency: string;
  dueAt: Date | null;
  clientId: string | null;
  clientGroupId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Out<typeof S.Fee> {
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    amountCents: f.amountCents,
    currency: f.currency,
    dueAt: d(f.dueAt),
    learnerId: f.clientId,
    groupId: f.clientGroupId,
    createdAt: dd(f.createdAt),
    updatedAt: dd(f.updatedAt),
  };
}

export function feePayment(p: {
  id: string;
  feeId: string;
  clientId: string;
  amountCents: number;
  currency: string;
  status: string;
  method: string | null;
  paidAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Out<typeof S.FeePayment> {
  return {
    id: p.id,
    feeId: p.feeId,
    learnerId: p.clientId,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    method: p.method,
    paidAt: d(p.paidAt),
    note: p.note,
    createdAt: dd(p.createdAt),
    updatedAt: dd(p.updatedAt),
  };
}

export function calendarEvent(e: {
  id: string;
  title: string;
  description: string | null;
  type: string;
  startAt: Date;
  endAt: Date | null;
  location: string | null;
  url: string | null;
  audience: string;
  clientId: string | null;
  clientGroupId: string | null;
  recurrence: string;
  recurrenceUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Out<typeof S.CalendarEvent> {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    type: e.type,
    startAt: dd(e.startAt),
    endAt: d(e.endAt),
    location: e.location,
    url: e.url,
    audience: e.audience,
    learnerId: e.clientId,
    groupId: e.clientGroupId,
    recurrence: e.recurrence,
    recurrenceUntil: d(e.recurrenceUntil),
    createdAt: dd(e.createdAt),
    updatedAt: dd(e.updatedAt),
  };
}

export function webhookSubscription(w: {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  status: string;
  createdAt: Date;
}): Out<typeof S.WebhookSubscription> {
  return { id: w.id, url: w.url, events: w.events, description: w.description, status: w.status, createdAt: dd(w.createdAt) };
}

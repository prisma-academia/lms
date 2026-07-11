export type FeeSeed = {
  name: string;
  description: string;
  amountCents: number;
  dueInDays: number;
  target: "client" | "clientGroup";
  /** Demo student has paid this fee. */
  studentPaid?: boolean;
};

export const FEE_CATALOG: FeeSeed[] = [
  {
    name: "Term registration fee",
    description: "2026 Term 1 registration for WAEC cohort students.",
    amountCents: 25_000_00, // ₦25,000
    dueInDays: 14,
    target: "clientGroup",
    studentPaid: false,
  },
  {
    name: "Course materials — Biology",
    description: "Printed workbook and lab guide for Biology for WAEC.",
    amountCents: 8_500_00, // ₦8,500
    dueInDays: 7,
    target: "client",
    studentPaid: true,
  },
];

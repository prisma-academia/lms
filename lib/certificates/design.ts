import { z } from "zod";

/** WYSIWYG certificate design, stored in Certificate.contentJson. */
export const certificateDesignSchema = z.object({
  title: z.string().max(120).default("Certificate of Completion"),
  subtitle: z.string().max(200).default("This is proudly presented to"),
  bodyText: z
    .string()
    .max(1000)
    .default("for successfully completing {{courseTitle}} on {{date}}."),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#0f172a"),
  footerText: z.string().max(200).default("Certificate no. {{serial}}"),
});

export type CertificateDesign = z.infer<typeof certificateDesignSchema>;

export function parseDesign(json: unknown): CertificateDesign {
  const result = certificateDesignSchema.safeParse(
    json && typeof json === "object" ? json : {}
  );
  return result.success ? result.data : certificateDesignSchema.parse({});
}

/** Replace {{placeholders}} in a template string with award data. */
export function fillTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => data[key] ?? "");
}

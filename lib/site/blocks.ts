import { z } from "zod";

const ctaSchema = z.object({
  label: z.string().min(1).max(80),
  href: z.string().min(1).max(300),
  variant: z.enum(["primary", "outline", "secondary"]).optional(),
});

const heroBlock = z.object({
  type: z.literal("hero"),
  id: z.string().min(1).max(64),
  headline: z.string().max(200).optional(),
  subcopy: z.string().max(500).optional(),
  showLogo: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  ctas: z.array(ctaSchema).max(4).default([]),
});

const richTextBlock = z.object({
  type: z.literal("richText"),
  id: z.string().min(1).max(64),
  html: z.string().max(50_000).default(""),
});

const aboutBlock = z.object({
  type: z.literal("about"),
  id: z.string().min(1).max(64),
  title: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
  showContact: z.boolean().default(true),
});

const benefitItem = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(300),
  icon: z.string().max(40).optional(),
});

const benefitsBlock = z.object({
  type: z.literal("benefits"),
  id: z.string().min(1).max(64),
  title: z.string().max(120).optional(),
  items: z.array(benefitItem).max(12).default([]),
});

const coursesBlock = z.object({
  type: z.literal("courses"),
  id: z.string().min(1).max(64),
  title: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(24).default(6),
});

const stepItem = z.object({
  title: z.string().min(1).max(80),
  body: z.string().max(300),
});

const stepsBlock = z.object({
  type: z.literal("steps"),
  id: z.string().min(1).max(64),
  title: z.string().max(120).optional(),
  items: z.array(stepItem).max(8).default([]),
  ctaLabel: z.string().max(80).optional(),
  ctaHref: z.string().max(300).optional(),
});

const faqItem = z.object({
  question: z.string().min(1).max(200),
  answer: z.string().max(2000),
});

const faqBlock = z.object({
  type: z.literal("faq"),
  id: z.string().min(1).max(64),
  title: z.string().max(120).optional(),
  items: z.array(faqItem).max(20).default([]),
});

const ctaBlock = z.object({
  type: z.literal("cta"),
  id: z.string().min(1).max(64),
  headline: z.string().max(200),
  subcopy: z.string().max(500).optional(),
  ctas: z.array(ctaSchema).max(4).default([]),
});

const imageBlock = z.object({
  type: z.literal("image"),
  id: z.string().min(1).max(64),
  imageKey: z.string().min(1).max(300),
  alt: z.string().max(200).optional(),
  caption: z.string().max(300).optional(),
});

const htmlBlock = z.object({
  type: z.literal("html"),
  id: z.string().min(1).max(64),
  html: z.string().max(50_000).default(""),
});

export const siteBlockSchema = z.discriminatedUnion("type", [
  heroBlock,
  richTextBlock,
  aboutBlock,
  benefitsBlock,
  coursesBlock,
  stepsBlock,
  faqBlock,
  ctaBlock,
  imageBlock,
  htmlBlock,
]);

export type SiteBlock = z.infer<typeof siteBlockSchema>;
export type SiteBlockType = SiteBlock["type"];

export const siteBlocksSchema = z.array(siteBlockSchema).max(40);

/** Parse stored blocksJson; never throws — drops invalid entries. */
export function parseSiteBlocks(json: unknown): SiteBlock[] {
  if (!Array.isArray(json)) return [];
  const out: SiteBlock[] = [];
  for (const item of json) {
    const r = siteBlockSchema.safeParse(item);
    if (r.success) out.push(r.data);
  }
  return out;
}

export function newBlockId(): string {
  return `b_${Math.random().toString(36).slice(2, 10)}`;
}

export const BLOCK_TYPE_LABELS: Record<SiteBlockType, string> = {
  hero: "Hero",
  richText: "Rich text",
  about: "About / contact",
  benefits: "Benefits",
  courses: "Courses grid",
  steps: "Steps",
  faq: "FAQ",
  cta: "Call to action",
  image: "Image",
  html: "HTML",
};

/**
 * Copy the pdf.js worker into public/ so it is served from our own origin.
 *
 * Not loaded from a CDN on purpose: a third-party script URL is a CSP problem
 * and an availability dependency for something that must work offline-ish. The
 * worker version must also match the pdfjs-dist build exactly, so it is copied
 * from node_modules rather than pinned by hand.
 *
 * Runs as part of `npm run build`; run it manually after bumping pdfjs-dist.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(root, "public");
const dest = join(destDir, "pdf.worker.min.mjs");

if (!existsSync(src)) {
  console.warn("[copy-pdf-worker] pdfjs-dist not installed; skipping.");
  process.exit(0);
}
if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("[copy-pdf-worker] public/pdf.worker.min.mjs updated.");

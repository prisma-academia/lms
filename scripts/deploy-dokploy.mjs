/**
 * Deploy the working tree to Dokploy.
 *
 *   npm run deploy            build a zip of the source and upload it; Dokploy builds and restarts the app
 *   npm run deploy -- --dry   build the zip only and say what would be sent
 *
 * Reads DOKPLOY_URL, DOKPLOY_API_KEY and DOKPLOY_APP_ID from .env.
 *
 * Why a zip and not a git push: the Dokploy server's GitHub connection cannot
 * see this repository, so the application's source type is "drop". What is
 * sent is exactly what git would track — committed or not — and nothing that
 * .gitignore excludes, so .env never leaves this machine.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dry = process.argv.includes("--dry");
const { DOKPLOY_URL, DOKPLOY_API_KEY, DOKPLOY_APP_ID } = process.env;
if (!dry && (!DOKPLOY_URL || !DOKPLOY_API_KEY || !DOKPLOY_APP_ID)) {
  console.error("Set DOKPLOY_URL, DOKPLOY_API_KEY and DOKPLOY_APP_ID in .env first.");
  process.exit(1);
}

// Tracked files plus new ones, minus anything ignored. Deleted files are still
// listed by git, so keep only what exists.
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { maxBuffer: 64 * 1024 * 1024 })
  .toString("utf8")
  .split("\0")
  .filter((f) => f && !f.startsWith(".env") && !f.startsWith(".claude/") && existsSync(f));

for (const needed of ["Dockerfile", "package.json", "package-lock.json", "prisma/schema.prisma"]) {
  if (!files.includes(needed)) {
    console.error(`${needed} is missing from the file list; not deploying.`);
    process.exit(1);
  }
}

const work = mkdtempSync(join(tmpdir(), "lms-deploy-"));
const list = join(work, "files.txt");
const zip = join(work, "lms.zip");
writeFileSync(list, files.join("\n") + "\n");

try {
  // bsdtar writes a zip when the name ends in .zip, with forward slashes in
  // entry names. Windows ships it as System32\tar.exe; Git Bash's own `tar`
  // is GNU tar and cannot, so name the Windows one explicitly.
  const tar = process.platform === "win32" ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  try {
    execFileSync(tar, ["-a", "-c", "-f", zip, "-T", list], { stdio: ["ignore", "ignore", "pipe"] });
  } catch {
    // GNU tar (most Linux): fall back to zip(1).
    execFileSync("zip", ["-q", zip, "-@"], { input: files.join("\n") + "\n" });
  }

  const size = statSync(zip).size;
  console.log(`${files.length} files, ${(size / 1024 / 1024).toFixed(1)} MB`);
  if (dry) {
    console.log("Dry run: nothing was uploaded.");
  } else {
    const form = new FormData();
    form.append("applicationId", DOKPLOY_APP_ID);
    form.append("zip", new Blob([readFileSync(zip)], { type: "application/zip" }), "lms.zip");
    const res = await fetch(`${DOKPLOY_URL.replace(/\/$/, "")}/api/application.dropDeployment`, {
      method: "POST",
      headers: { "x-api-key": DOKPLOY_API_KEY },
      body: form,
    });
    if (!res.ok) {
      console.error(`Upload failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      process.exitCode = 1;
    } else {
      console.log("Uploaded. Dokploy is building; the site switches over when the build finishes (about 7 minutes).");
      console.log(`Progress: ${DOKPLOY_URL} → project "lms" → web → Deployments`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

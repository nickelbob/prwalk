import { join } from "node:path";

/** Slugify a branch name into a safe filename stem (feat/login -> feat-login). */
export function branchToSlug(branch: string): string {
  return branch.replace(/[/\\]/g, "-").replace(/[^A-Za-z0-9._-]/g, "_");
}

export function prwalkDir(repoRoot: string): string {
  return join(repoRoot, ".prwalk");
}

export function manifestPath(repoRoot: string, branch: string): string {
  return join(prwalkDir(repoRoot), `${branchToSlug(branch)}.json`);
}

export function lockPath(repoRoot: string, branch: string): string {
  return join(prwalkDir(repoRoot), `${branchToSlug(branch)}.lock`);
}

import { join } from "node:path";
/** Slugify a branch name into a safe filename stem (feat/login -> feat-login). */
export function branchToSlug(branch) {
    return branch.replace(/[/\\]/g, "-").replace(/[^A-Za-z0-9._-]/g, "_");
}
export function prwalkDir(repoRoot) {
    return join(repoRoot, ".prwalk");
}
export function manifestPath(repoRoot, branch) {
    return join(prwalkDir(repoRoot), `${branchToSlug(branch)}.json`);
}
export function lockPath(repoRoot, branch) {
    return join(prwalkDir(repoRoot), `${branchToSlug(branch)}.lock`);
}
/** Lock file for the single server instance that owns writes to this repo. */
export function serveLockPath(repoRoot) {
    return join(prwalkDir(repoRoot), ".serve.lock");
}
//# sourceMappingURL=paths.js.map
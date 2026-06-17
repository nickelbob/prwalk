import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
export class GitError extends Error {
}
async function git(cwd, args) {
    try {
        const { stdout } = await execFileAsync("git", args, {
            cwd,
            maxBuffer: 64 * 1024 * 1024,
        });
        return stdout;
    }
    catch (err) {
        const e = err;
        throw new GitError(`git ${args.join(" ")} failed: ${(e.stderr || e.message || "").trim()}`);
    }
}
export async function isGitRepo(cwd) {
    try {
        const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
        return out.trim() === "true";
    }
    catch {
        return false;
    }
}
export async function currentBranch(cwd) {
    return (await git(cwd, ["symbolic-ref", "--short", "HEAD"])).trim();
}
export async function revParse(cwd, ref) {
    return (await git(cwd, ["rev-parse", "--verify", ref])).trim();
}
export async function mergeBase(cwd, a, b) {
    try {
        return (await git(cwd, ["merge-base", a, b])).trim();
    }
    catch {
        return null;
    }
}
/** Unified diff text between two committish refs/SHAs. */
export async function diff(cwd, from, to, opts = {}) {
    const contextLines = opts.contextLines ?? 3;
    const excludes = (opts.excludePaths ?? []).map((p) => `:(exclude)${p}`);
    return git(cwd, [
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--find-renames",
        "--find-copies",
        `--unified=${contextLines}`,
        "--src-prefix=a/",
        "--dst-prefix=b/",
        from,
        to,
        // Path filtering: everything except the excluded paths (prwalk's own logs).
        ...(excludes.length ? ["--", ".", ...excludes] : []),
    ]);
}
/** `git diff --numstat` raw output (added\tremoved\tpath per line). */
export async function numstat(cwd, from, to) {
    return git(cwd, ["diff", "--numstat", "--find-renames", from, to]);
}
/** Number of uncommitted (working tree + index) changes, for a dirty warning. */
export async function uncommittedCount(cwd) {
    const out = await git(cwd, ["status", "--porcelain"]);
    return out.split("\n").filter((l) => l.trim().length > 0).length;
}
export async function add(cwd, path) {
    await git(cwd, ["add", "--", path]);
}
export async function repoRoot(cwd) {
    return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
}
/**
 * Working-tree state of a single path, for telling the reviewer whether the
 * audit log has been committed yet. "committed" = no pending change (clean);
 * "staged" = changes in the index (prwalk git-adds after each decision);
 * "modified" = unstaged changes; "untracked" = never added.
 */
export async function pathStatus(cwd, path) {
    const out = (await git(cwd, ["status", "--porcelain", "--", path])).trimEnd();
    if (!out)
        return "committed";
    const code = out.slice(0, 2); // XY: X=index, Y=worktree
    if (code === "??")
        return "untracked";
    if (code[0] !== " ")
        return "staged"; // has an index change (possibly + worktree)
    return "modified";
}
/** Fetch refs from a remote (prunes deleted remote branches). */
export async function fetch(cwd, remote) {
    await git(cwd, ["fetch", "--prune", remote]);
}
/** Local short branch names plus remote-tracking branch names for `remote`. */
export async function listRemoteBranches(cwd, remote) {
    const out = await git(cwd, [
        "for-each-ref",
        "--format=%(refname:short)",
        `refs/remotes/${remote}`,
        "refs/heads",
    ]);
    return out
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.endsWith("/HEAD"));
}
/** Check out a branch (creating a tracking branch from the remote if needed). */
export async function checkout(cwd, branch) {
    await git(cwd, ["checkout", branch]);
}
//# sourceMappingURL=git.js.map
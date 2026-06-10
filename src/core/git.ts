import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitError extends Error {}

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    throw new GitError(
      `git ${args.join(" ")} failed: ${(e.stderr || e.message || "").trim()}`,
    );
  }
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const out = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}

export async function currentBranch(cwd: string): Promise<string> {
  return (await git(cwd, ["symbolic-ref", "--short", "HEAD"])).trim();
}

export async function revParse(cwd: string, ref: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "--verify", ref])).trim();
}

export async function mergeBase(
  cwd: string,
  a: string,
  b: string,
): Promise<string | null> {
  try {
    return (await git(cwd, ["merge-base", a, b])).trim();
  } catch {
    return null;
  }
}

/** Unified diff text between two committish refs/SHAs. */
export async function diff(
  cwd: string,
  from: string,
  to: string,
  opts: { contextLines?: number; excludePaths?: string[] } = {},
): Promise<string> {
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
export async function numstat(
  cwd: string,
  from: string,
  to: string,
): Promise<string> {
  return git(cwd, ["diff", "--numstat", "--find-renames", from, to]);
}

/** Number of uncommitted (working tree + index) changes, for a dirty warning. */
export async function uncommittedCount(cwd: string): Promise<number> {
  const out = await git(cwd, ["status", "--porcelain"]);
  return out.split("\n").filter((l) => l.trim().length > 0).length;
}

export async function add(cwd: string, path: string): Promise<void> {
  await git(cwd, ["add", "--", path]);
}

export async function repoRoot(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
}

/** Fetch refs from a remote (prunes deleted remote branches). */
export async function fetch(cwd: string, remote: string): Promise<void> {
  await git(cwd, ["fetch", "--prune", remote]);
}

/** Local short branch names plus remote-tracking branch names for `remote`. */
export async function listRemoteBranches(
  cwd: string,
  remote: string,
): Promise<string[]> {
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
export async function checkout(cwd: string, branch: string): Promise<void> {
  await git(cwd, ["checkout", branch]);
}

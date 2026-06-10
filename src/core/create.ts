import * as git from "./git.js";
import { parseDiff } from "./diffParser.js";
import { chunkFiles } from "./chunker.js";
import { loadManifest, writeManifest } from "./manifest.js";
import { manifestPath } from "./paths.js";
import { buildInitialManifest, mergeRound, type MergeCounts } from "./merge.js";
import { loadConfig, issueUrl } from "./config.js";
import { extractIssueKey } from "./issueKey.js";
import type { Manifest } from "./schema.js";

export interface CreateOptions {
  base: string;
  branch?: string;
  title?: string;
  maxHunkLines?: number;
  /** Explicit issue-key override; falls back to extraction from the branch. */
  issue?: string;
}

export interface CreateResult {
  manifest: Manifest;
  manifestPath: string;
  counts: MergeCounts;
  round: number;
  baseSha: string;
  headSha: string;
  branch: string;
  warnings: string[];
}

/**
 * Compute the diff for a branch vs its merge-base with `base`, split into
 * chunks, and scaffold-or-merge the `.prwalk/<branch>.json` manifest.
 * Diffs committed SHAs only (working-tree changes are warned about, not used).
 */
export async function createReview(
  cwd: string,
  opts: CreateOptions,
): Promise<CreateResult> {
  const warnings: string[] = [];
  const repoRoot = await git.repoRoot(cwd);
  const branch = opts.branch ?? (await git.currentBranch(cwd));

  const headSha = await git.revParse(cwd, branch);
  const baseSha = await git.revParse(cwd, opts.base);
  const base = await git.mergeBase(cwd, baseSha, headSha);
  if (!base) {
    throw new Error(
      `prwalk: no common ancestor between ${opts.base} and ${branch}; pick a valid base.`,
    );
  }

  const dirty = await git.uncommittedCount(cwd);
  if (dirty > 0) {
    warnings.push(
      `${dirty} uncommitted change(s) are NOT included; the review reflects committed code only. Commit first for an accurate review.`,
    );
  }

  // Exclude prwalk's own audit logs: once committed they appear in the
  // base..head diff, but they must never be reviewed as code.
  const diffText = await git.diff(cwd, base, headSha, {
    excludePaths: [".prwalk/"],
  });
  const files = parseDiff(diffText);
  const candidates = chunkFiles(files, { maxHunkLines: opts.maxHunkLines });

  const path = manifestPath(repoRoot, branch);
  const existing = await loadManifest(path);

  // Correlate to a tracker issue: explicit --issue wins, else extract from the
  // branch using the configured regex. Only set tracker/url when we have a key.
  const config = await loadConfig(repoRoot);
  const issueKey =
    opts.issue?.trim() ||
    extractIssueKey(branch, config.jira.issueKeyRegex) ||
    null;
  if (opts.issue && !issueKey) {
    warnings.push(`--issue was empty; no issue key recorded.`);
  }

  const meta = {
    branch,
    baseRef: opts.base,
    baseSha: base, // store the merge-base we actually diffed against
    headSha,
    title: opts.title,
    issueKey,
    issueUrl: issueKey ? issueUrl(config, issueKey) : null,
    tracker: issueKey ? config.tracker ?? ("jira" as const) : null,
  };

  const { manifest, counts } = existing
    ? mergeRound(existing, candidates, meta)
    : buildInitialManifest(candidates, meta);

  await writeManifest(path, manifest);
  await git.add(repoRoot, path);

  return {
    manifest,
    manifestPath: path,
    counts,
    round: manifest.pr.currentRound,
    baseSha: base,
    headSha,
    branch,
    warnings,
  };
}

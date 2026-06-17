import { currentBranch, repoRoot, revParse, pathStatus } from "../../core/git.js";
import { loadManifest } from "../../core/manifest.js";
import { manifestPath } from "../../core/paths.js";
import { buildStatusReport } from "../../core/report.js";

export interface StatusOpts {
  json?: boolean;
}

export async function cmdStatus(
  cwd: string,
  branch: string | undefined,
  opts: StatusOpts,
): Promise<void> {
  const root = await repoRoot(cwd);
  const br = branch ?? (await currentBranch(cwd));
  const path = manifestPath(root, br);
  const manifest = await loadManifest(path);

  if (!manifest) {
    if (opts.json) {
      process.stdout.write(JSON.stringify({ error: "no review", branch: br }) + "\n");
    } else {
      process.stdout.write(`prwalk: no review found for ${br} (run: prwalk create --base <ref>)\n`);
    }
    process.exitCode = 1;
    return;
  }

  let liveHead: string | null = null;
  try {
    liveHead = await revParse(cwd, manifest.pr.branch);
  } catch {
    liveHead = null;
  }
  const report = buildStatusReport(manifest, liveHead);
  const auditState = await pathStatus(cwd, path);
  const issueKey = manifest.pr.issueKey;
  const tracker = manifest.pr.tracker;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({
        ...report,
        audit: { path, state: auditState },
        issueKey,
        issueUrl: manifest.pr.issueUrl,
      }) + "\n",
    );
    return;
  }

  const lines: string[] = [];
  lines.push(
    `${report.branch} — round ${report.round} — ${report.status.toUpperCase().replace("_", " ")} ` +
      `(${report.counts.rejected} rejected, ${report.counts.pending} pending, ${report.counts.accepted} accepted)`,
  );
  if (report.reviewLevel !== null) {
    lines.push(
      `  review level: ${report.reviewLevel}+ · ${report.autoAccepted} chunk(s) auto-accepted below level`,
    );
  } else {
    lines.push(`  review level: not set yet (reviewer picks a 1–5 floor before reviewing)`);
  }
  if (report.stale) {
    lines.push(`  ! branch advanced since this review was generated — re-run prwalk create`);
  }
  if (report.rejected.length) {
    lines.push(``, `Rejected chunks (act on these):`);
    for (const c of report.rejected) {
      lines.push(`  [${c.stableId}] risk ${c.risk} · ${c.file}  ${c.description ? `"${c.description}"` : ""}`);
      if (c.feedback) lines.push(`     feedback: ${c.feedback}`);
    }
  }
  if (report.pending.length) {
    lines.push(``, `Pending chunks (awaiting review):`);
    for (const c of report.pending) {
      lines.push(`  [${c.stableId}] risk ${c.risk} · ${c.file}  ${c.description ? `"${c.description}"` : ""}`);
    }
  }

  // End-of-round ledger: what's recorded, and what still has to happen.
  const auditLabel: Record<typeof auditState, string> = {
    committed: "committed ✓",
    staged: "saved & staged (NOT yet committed)",
    modified: "saved, unstaged (NOT yet committed)",
    untracked: "saved, untracked (NOT yet committed)",
  };
  lines.push(``, `This review:`);
  lines.push(`  audit log: ${path} — ${auditLabel[auditState]}`);
  if (issueKey) {
    lines.push(`  ${issueKey}: linked${report.pending.length === 0 ? "" : " · review still in progress"} — JIRA changes only on \`prwalk sync\` (reviewing never touches it)`);
  } else {
    lines.push(`  tracker: not linked (no issue key on this review)`);
  }

  const next: string[] = [];
  if (report.pending.length > 0) {
    next.push(`reviewer: ${report.pending.length} chunk(s) still pending — finish the walkthrough`);
  }
  if (auditState !== "committed") {
    next.push(`you: commit the audit log →  git commit -m "$(prwalk commit-msg ${report.branch})"`);
  }
  if (issueKey && tracker && report.pending.length === 0) {
    next.push(`agent: prwalk sync ${report.branch}  → update ${issueKey} (${report.status})`);
  }
  if (next.length) {
    lines.push(``, `Next:`);
    for (const n of next) lines.push(`  • ${n}`);
  }

  process.stdout.write(lines.join("\n") + "\n");
}

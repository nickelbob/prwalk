import { currentBranch, repoRoot, revParse } from "../../core/git.js";
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

  if (opts.json) {
    process.stdout.write(JSON.stringify(report) + "\n");
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
  process.stdout.write(lines.join("\n") + "\n");
}

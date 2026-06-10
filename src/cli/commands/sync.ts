import { currentBranch, repoRoot } from "../../core/git.js";
import { loadManifest } from "../../core/manifest.js";
import { manifestPath } from "../../core/paths.js";
import { loadConfig } from "../../core/config.js";
import { buildSyncPlan } from "../../core/sync.js";

export interface SyncOpts {
  json?: boolean;
  execute?: boolean;
}

/**
 * Emit the SyncPlan — what should happen in the tracker for the current review
 * state. Default: print it for the orchestrating agent to execute via its own
 * JIRA tools. `--json` for machine consumption. `--execute` (native REST
 * executor) is not built yet.
 */
export async function cmdSync(
  cwd: string,
  branch: string | undefined,
  opts: SyncOpts,
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

  const config = await loadConfig(root);
  const plan = buildSyncPlan(manifest, config);

  if (opts.execute) {
    process.stderr.write(
      `prwalk: native --execute is not built yet. Pipe \`prwalk sync ${br} --json\` to your agent, ` +
        `which executes the plan via its JIRA tools.\n`,
    );
    process.exitCode = 2;
    return;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(plan) + "\n");
    return;
  }

  const lines: string[] = [];
  if (plan.noop) {
    lines.push(
      `prwalk: no tracker sync for ${br} — ${
        plan.issueKey ? "no tracker configured (.prwalk/config.json)" : "no issue key on this review"
      }.`,
    );
    lines.push(`  Reviewer command: ${plan.reviewLink}`);
    process.stdout.write(lines.join("\n") + "\n");
    return;
  }

  lines.push(`prwalk sync — ${plan.issueKey} (${plan.prStatus})`);
  if (plan.issueUrl) lines.push(`  ${plan.issueUrl}`);
  lines.push(`  transition: ${plan.transition ?? "(none mapped)"}`);
  lines.push(`  assignee:   ${plan.assignee ?? "(unchanged)"}`);
  lines.push(`  comment:`);
  for (const l of plan.comment.split("\n")) lines.push(`    ${l}`);
  lines.push(``);
  lines.push(`  Agent: execute this against ${plan.issueKey} via your JIRA tools`);
  lines.push(`  (or run \`prwalk sync ${br} --json\` for the structured plan).`);
  process.stdout.write(lines.join("\n") + "\n");
}

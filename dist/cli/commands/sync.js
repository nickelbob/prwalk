import { currentBranch, repoRoot } from "../../core/git.js";
import { loadManifest } from "../../core/manifest.js";
import { manifestPath } from "../../core/paths.js";
import { loadConfig } from "../../core/config.js";
import { buildSyncPlan } from "../../core/sync.js";
import { JiraClient, describeExecution, executeSyncPlan, } from "../../core/jiraClient.js";
/**
 * Emit the SyncPlan — what should happen in the tracker for the current review
 * state. Default: print it for the orchestrating agent to execute via its own
 * JIRA tools. `--json` for machine consumption. `--execute` (native REST
 * executor) is not built yet.
 */
export async function cmdSync(cwd, branch, opts) {
    const root = await repoRoot(cwd);
    const br = branch ?? (await currentBranch(cwd));
    const path = manifestPath(root, br);
    const manifest = await loadManifest(path);
    if (!manifest) {
        if (opts.json) {
            process.stdout.write(JSON.stringify({ error: "no review", branch: br }) + "\n");
        }
        else {
            process.stdout.write(`prwalk: no review found for ${br} (run: prwalk create --base <ref>)\n`);
        }
        process.exitCode = 1;
        return;
    }
    const config = await loadConfig(root);
    const plan = buildSyncPlan(manifest, config);
    if (opts.dryRun) {
        const actions = describeExecution(plan);
        if (opts.json) {
            process.stdout.write(JSON.stringify({ plan, actions, dryRun: true }) + "\n");
            return;
        }
        process.stdout.write(`prwalk sync --dry-run — ${plan.issueKey ?? "(no issue)"}\n`);
        if (actions.length === 0) {
            process.stdout.write(`  (nothing to do — no issue key / tracker)\n`);
        }
        else {
            for (const a of actions)
                process.stdout.write(`  would ${a.detail}\n`);
        }
        return;
    }
    if (opts.execute) {
        if (plan.noop) {
            process.stdout.write(`prwalk: nothing to sync for ${br} (no issue key or no tracker configured).\n`);
            return;
        }
        const baseUrl = process.env.JIRA_BASE_URL || config.jira.baseUrl;
        const email = process.env.JIRA_EMAIL;
        const token = process.env.JIRA_API_TOKEN;
        const missing = [
            !baseUrl && "JIRA_BASE_URL (or jira.baseUrl in config)",
            !email && "JIRA_EMAIL",
            !token && "JIRA_API_TOKEN",
        ].filter(Boolean);
        if (missing.length) {
            process.stderr.write(`prwalk: --execute needs credentials in the environment. Missing: ${missing.join(", ")}.\n` +
                `  Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens\n` +
                `  Or omit --execute and pipe \`prwalk sync ${br} --json\` to an agent with JIRA tools.\n`);
            process.exitCode = 2;
            return;
        }
        try {
            const client = new JiraClient({
                baseUrl: baseUrl,
                email: email,
                token: token,
            });
            const result = await executeSyncPlan(plan, client);
            for (const d of result.done)
                process.stdout.write(`  ✓ ${d}\n`);
            for (const s of result.skipped)
                process.stdout.write(`  · ${s}\n`);
            process.stdout.write(`prwalk: synced ${plan.issueKey} (${plan.prStatus}).\n`);
        }
        catch (e) {
            process.stderr.write(`prwalk: sync --execute failed: ${e.message}\n`);
            process.exitCode = 1;
        }
        return;
    }
    if (opts.json) {
        process.stdout.write(JSON.stringify(plan) + "\n");
        return;
    }
    const lines = [];
    if (plan.noop) {
        lines.push(`prwalk: no tracker sync for ${br} — ${plan.issueKey ? "no tracker configured (.prwalk/config.json)" : "no issue key on this review"}.`);
        lines.push(`  Reviewer command: ${plan.reviewLink}`);
        process.stdout.write(lines.join("\n") + "\n");
        return;
    }
    lines.push(`prwalk sync — ${plan.issueKey} (${plan.prStatus})`);
    if (plan.issueUrl)
        lines.push(`  ${plan.issueUrl}`);
    lines.push(`  transition: ${plan.transition ?? "(none mapped)"}`);
    lines.push(`  assignee:   ${plan.assignee ?? "(unchanged)"}`);
    lines.push(`  comment:`);
    for (const l of plan.comment.split("\n"))
        lines.push(`    ${l}`);
    lines.push(``);
    lines.push(`  Agent: execute this against ${plan.issueKey} via your JIRA tools`);
    lines.push(`  (or run \`prwalk sync ${br} --json\` for the structured plan).`);
    process.stdout.write(lines.join("\n") + "\n");
}
//# sourceMappingURL=sync.js.map
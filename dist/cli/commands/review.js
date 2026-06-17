import * as git from "../../core/git.js";
import { loadConfig } from "../../core/config.js";
import { extractIssueKey } from "../../core/issueKey.js";
import { cmdServe } from "./serve.js";
/**
 * Reviewer entry point. Given a tracker issue key, fetch the remote, resolve the
 * branch that carries that key, check it out, and serve the review locally.
 *
 * The manifest embeds its diffs, so reviewing needs no build — only the branch's
 * committed `.prwalk/<slug>.json`. Decisions write back to that file (and are
 * staged); the reviewer commits + pushes the audit log afterward.
 */
export async function cmdReview(cwd, issue, opts) {
    const root = await git.repoRoot(cwd);
    const config = await loadConfig(root);
    const remote = opts.remote ?? config.jira.remote ?? "origin";
    // 1. Fetch so the branch (and its committed manifest) are available locally.
    try {
        await git.fetch(cwd, remote);
    }
    catch (e) {
        process.stderr.write(`prwalk: could not fetch from '${remote}' (${e.message}). ` +
            `Continuing with local refs.\n`);
    }
    // 2. Resolve the branch: explicit --branch, else match the issue key in refs.
    let branch = opts.branch;
    if (!branch) {
        const issueKey = issue.trim();
        const refs = await git.listRemoteBranches(cwd, remote);
        const matches = refs
            .map((r) => ({ ref: r, local: stripRemotePrefix(r, remote) }))
            // The branch name must contain the issue key (validated via the configured regex).
            .filter((m) => extractIssueKey(m.local, config.jira.issueKeyRegex) === issueKey);
        if (matches.length === 0) {
            process.stderr.write(`prwalk: no branch found for ${issueKey} on '${remote}'. ` +
                `Pass --branch <name>, or check the branch was pushed.\n`);
            process.exitCode = 1;
            return;
        }
        if (matches.length > 1) {
            process.stderr.write(`prwalk: multiple branches match ${issueKey}: ${matches
                .map((m) => m.local)
                .join(", ")}. Using ${matches[0].local}; pass --branch to pick.\n`);
        }
        branch = matches[0].local;
    }
    // 3. Checkout (DWIM-creates a tracking branch from the remote). Warn on dirty.
    const dirty = await git.uncommittedCount(cwd);
    if (dirty > 0) {
        process.stderr.write(`prwalk: ${dirty} uncommitted change(s) in the working tree — checkout may fail or stash is needed.\n`);
    }
    try {
        await git.checkout(cwd, branch);
    }
    catch (e) {
        process.stderr.write(`prwalk: could not check out '${branch}' (${e.message}). ` +
            `Resolve the working tree, then re-run.\n`);
        process.exitCode = 1;
        return;
    }
    process.stdout.write(`prwalk: reviewing ${issue} on branch ${branch}\n`);
    // 4. Serve, deep-linked to the branch.
    await cmdServe(cwd, branch, { port: opts.port, open: opts.open });
}
/** "origin/feat/x" -> "feat/x"; leaves local branch names unchanged. */
function stripRemotePrefix(ref, remote) {
    const prefix = `${remote}/`;
    return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref;
}
//# sourceMappingURL=review.js.map
import { repoRoot } from "../../core/git.js";
import { branchToSlug } from "../../core/paths.js";
import { acquireServerLock } from "../../core/lock.js";
import { startServer } from "../../server/index.js";
export async function cmdServe(cwd, branch, opts) {
    const root = await repoRoot(cwd);
    const explicitPort = opts.port !== undefined;
    const port = opts.port ?? 7777;
    // Single-writer lock: if another server already owns this repo, run read-only.
    const lock = acquireServerLock(root, port);
    const readOnly = !lock.acquired;
    const handle = await startServer({
        repoRoot: root,
        port,
        autoPort: !explicitPort,
        dev: opts.dev,
        readOnly,
    });
    // Resolve the deep-link slug if a branch was given (accepts branch or slug).
    let slug;
    if (branch)
        slug = branchToSlug(branch);
    const reviewUrl = slug ? `${handle.url}/r/${slug}` : handle.url;
    if (opts.json) {
        process.stdout.write(JSON.stringify({ url: handle.url, reviewUrl, port: handle.port, slug, readOnly }) + "\n");
    }
    else {
        process.stdout.write(`prwalk serving at ${handle.url}\n`);
        process.stdout.write(`  -> review link: ${reviewUrl}\n`);
        if (readOnly) {
            process.stdout.write(`  ! read-only: another prwalk server (pid ${lock.holder?.pid}, port ${lock.holder?.port}) owns writes for this repo; decisions are disabled here.\n`);
        }
        process.stdout.write(`  (Ctrl-C to stop)\n`);
    }
    if (opts.open) {
        void openBrowser(reviewUrl);
    }
    // Keep the process alive.
    await new Promise(() => { });
}
async function openBrowser(url) {
    const { execFile } = await import("node:child_process");
    const cmd = process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
            ? "start"
            : "xdg-open";
    try {
        execFile(cmd, [url]);
    }
    catch {
        /* best effort */
    }
}
//# sourceMappingURL=serve.js.map
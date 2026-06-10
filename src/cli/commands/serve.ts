import { repoRoot } from "../../core/git.js";
import { branchToSlug } from "../../core/paths.js";
import { startServer } from "../../server/index.js";

export interface ServeOpts {
  port?: number;
  open?: boolean;
  dev?: boolean;
  json?: boolean;
}

export async function cmdServe(
  cwd: string,
  branch: string | undefined,
  opts: ServeOpts,
): Promise<void> {
  const root = await repoRoot(cwd);
  const explicitPort = opts.port !== undefined;
  const port = opts.port ?? 7777;

  const handle = await startServer({
    repoRoot: root,
    port,
    autoPort: !explicitPort,
    dev: opts.dev,
  });

  // Resolve the deep-link slug if a branch was given (accepts branch or slug).
  let slug: string | undefined;
  if (branch) slug = branchToSlug(branch);
  const reviewUrl = slug ? `${handle.url}/r/${slug}` : handle.url;

  if (opts.json) {
    process.stdout.write(
      JSON.stringify({ url: handle.url, reviewUrl, port: handle.port, slug }) + "\n",
    );
  } else {
    process.stdout.write(`prwalk serving at ${handle.url}\n`);
    process.stdout.write(`  -> review link: ${reviewUrl}\n`);
    process.stdout.write(`  (Ctrl-C to stop)\n`);
  }

  if (opts.open) {
    void openBrowser(reviewUrl);
  }

  // Keep the process alive.
  await new Promise<void>(() => {});
}

async function openBrowser(url: string): Promise<void> {
  const { execFile } = await import("node:child_process");
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    execFile(cmd, [url]);
  } catch {
    /* best effort */
  }
}

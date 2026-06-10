import { currentBranch, repoRoot } from "../../core/git.js";
import { loadManifest } from "../../core/manifest.js";
import { manifestPath } from "../../core/paths.js";
import { suggestCommitMessage } from "../../core/report.js";

export async function cmdCommitMsg(
  cwd: string,
  branch: string | undefined,
): Promise<void> {
  const root = await repoRoot(cwd);
  const br = branch ?? (await currentBranch(cwd));
  const manifest = await loadManifest(manifestPath(root, br));
  if (!manifest) {
    process.stderr.write(`prwalk: no review found for ${br}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(suggestCommitMessage(manifest) + "\n");
}

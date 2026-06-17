import { repoRoot } from "../../core/git.js";
import { ReviewStore } from "../../server/persistence.js";
import { countDecisions, deriveStatus } from "../../core/status.js";
export async function cmdList(cwd, opts) {
    const root = await repoRoot(cwd);
    const store = new ReviewStore(root);
    const items = await store.list();
    const rows = items.map(({ slug, manifest }) => ({
        slug,
        branch: manifest.pr.branch,
        round: manifest.pr.currentRound,
        status: deriveStatus(manifest),
        counts: countDecisions(manifest),
    }));
    if (opts.json) {
        process.stdout.write(JSON.stringify(rows) + "\n");
        return;
    }
    if (rows.length === 0) {
        process.stdout.write(`prwalk: no reviews in this repo.\n`);
        return;
    }
    for (const r of rows) {
        process.stdout.write(`${r.branch}  (round ${r.round})  ${r.status}  ` +
            `[${r.counts.accepted}✓ ${r.counts.rejected}✗ ${r.counts.pending}·]\n`);
    }
}
//# sourceMappingURL=list.js.map
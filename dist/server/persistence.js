import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import * as git from "../core/git.js";
import { loadManifest, writeManifest } from "../core/manifest.js";
import { prwalkDir } from "../core/paths.js";
import { applyDecision } from "../core/decisions.js";
import { applyReviewLevel } from "../core/reviewLevel.js";
/** `.prwalk/*.json` files that are NOT review manifests. */
const RESERVED_SLUGS = new Set(["config"]);
/**
 * Owns all manifest reads/writes while the server runs. Reviews are addressed
 * by branch slug (the `.prwalk/<slug>.json` stem) so URLs never contain a
 * slash. Writes are serialized per slug through an async mutex, then `git add`ed.
 */
export class ReviewStore {
    repoRoot;
    locks = new Map();
    constructor(repoRoot) {
        this.repoRoot = repoRoot;
    }
    pathForSlug(slug) {
        return join(prwalkDir(this.repoRoot), `${slug}.json`);
    }
    /** List all reviews present on disk. */
    async list() {
        const dir = prwalkDir(this.repoRoot);
        if (!existsSync(dir))
            return [];
        const files = (await readdir(dir)).filter((f) => f.endsWith(".json") && !RESERVED_SLUGS.has(basename(f, ".json")));
        const out = [];
        for (const f of files) {
            try {
                const manifest = await loadManifest(join(dir, f));
                if (manifest)
                    out.push({ slug: basename(f, ".json"), manifest });
            }
            catch {
                // A stray/invalid .json in .prwalk/ shouldn't break listing real reviews.
            }
        }
        return out.sort((a, b) => a.manifest.pr.branch.localeCompare(b.manifest.pr.branch));
    }
    async load(slug) {
        if (RESERVED_SLUGS.has(slug))
            return null;
        return loadManifest(this.pathForSlug(slug));
    }
    async withLock(slug, fn) {
        const prev = this.locks.get(slug) ?? Promise.resolve();
        let release;
        const next = new Promise((res) => (release = res));
        this.locks.set(slug, prev.then(() => next));
        await prev.catch(() => { });
        try {
            return await fn();
        }
        finally {
            release();
        }
    }
    async decide(slug, input) {
        return this.withLock(slug, async () => {
            const path = this.pathForSlug(slug);
            const manifest = await loadManifest(path);
            if (!manifest)
                throw new Error(`no review for ${slug}`);
            const { manifest: updated, chunk } = applyDecision(manifest, input);
            await writeManifest(path, updated);
            await git.add(this.repoRoot, path);
            return { manifest: updated, chunk };
        });
    }
    async setReviewLevel(slug, level) {
        return this.withLock(slug, async () => {
            const path = this.pathForSlug(slug);
            const manifest = await loadManifest(path);
            if (!manifest)
                throw new Error(`no review for ${slug}`);
            const { manifest: updated, summary } = applyReviewLevel(manifest, level);
            await writeManifest(path, updated);
            await git.add(this.repoRoot, path);
            return { manifest: updated, summary };
        });
    }
    async liveHeadSha(branch) {
        try {
            return await git.revParse(this.repoRoot, branch);
        }
        catch {
            return null;
        }
    }
}
//# sourceMappingURL=persistence.js.map
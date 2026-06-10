import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import * as git from "../core/git.js";
import { loadManifest, writeManifest } from "../core/manifest.js";
import { prwalkDir } from "../core/paths.js";
import { applyDecision, type DecisionInput } from "../core/decisions.js";
import type { Manifest } from "../core/schema.js";

/**
 * Owns all manifest reads/writes while the server runs. Reviews are addressed
 * by branch slug (the `.prwalk/<slug>.json` stem) so URLs never contain a
 * slash. Writes are serialized per slug through an async mutex, then `git add`ed.
 */
export class ReviewStore {
  private locks = new Map<string, Promise<unknown>>();

  constructor(private repoRoot: string) {}

  private pathForSlug(slug: string): string {
    return join(prwalkDir(this.repoRoot), `${slug}.json`);
  }

  /** List all reviews present on disk. */
  async list(): Promise<{ slug: string; manifest: Manifest }[]> {
    const dir = prwalkDir(this.repoRoot);
    if (!existsSync(dir)) return [];
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    const out: { slug: string; manifest: Manifest }[] = [];
    for (const f of files) {
      const manifest = await loadManifest(join(dir, f));
      if (manifest) out.push({ slug: basename(f, ".json"), manifest });
    }
    return out.sort((a, b) => a.manifest.pr.branch.localeCompare(b.manifest.pr.branch));
  }

  async load(slug: string): Promise<Manifest | null> {
    return loadManifest(this.pathForSlug(slug));
  }

  private async withLock<T>(slug: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(slug) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((res) => (release = res));
    this.locks.set(slug, prev.then(() => next));
    await prev.catch(() => {});
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async decide(slug: string, input: DecisionInput) {
    return this.withLock(slug, async () => {
      const path = this.pathForSlug(slug);
      const manifest = await loadManifest(path);
      if (!manifest) throw new Error(`no review for ${slug}`);
      const { manifest: updated, chunk } = applyDecision(manifest, input);
      await writeManifest(path, updated);
      await git.add(this.repoRoot, path);
      return { manifest: updated, chunk };
    });
  }

  async liveHeadSha(branch: string): Promise<string | null> {
    try {
      return await git.revParse(this.repoRoot, branch);
    } catch {
      return null;
    }
  }
}

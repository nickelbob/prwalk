import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { parseManifest } from "./schema.js";
import { prwalkDir } from "./paths.js";
export async function loadManifest(path) {
    if (!existsSync(path))
        return null;
    const raw = await readFile(path, "utf8");
    return parseManifest(JSON.parse(raw));
}
/** Atomically write a manifest: temp file in the same dir, then rename. */
export async function writeManifest(path, manifest) {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp.${process.pid}`;
    const json = JSON.stringify(manifest, null, 2) + "\n";
    await writeFile(tmp, json, "utf8");
    await rename(tmp, path);
}
export async function ensurePrwalkDir(repoRoot) {
    await mkdir(prwalkDir(repoRoot), { recursive: true });
}
//# sourceMappingURL=manifest.js.map
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
/**
 * Locate the built React client (`dist/client`) relative to this module,
 * walking up from the compiled file location so it resolves regardless of
 * where the global bin was installed/linked.
 */
export function resolveClientDir() {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
        const candidate = join(dir, "client");
        if (existsSync(join(candidate, "index.html")))
            return candidate;
        const distCandidate = join(dir, "dist", "client");
        if (existsSync(join(distCandidate, "index.html")))
            return distCandidate;
        dir = dirname(dir);
    }
    return null;
}
//# sourceMappingURL=resolveAssets.js.map
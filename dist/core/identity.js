import { createHash } from "node:crypto";
/**
 * Chunk-identity primitives + the Tier 0–3 matcher used to carry a stable
 * chunk identity across review rounds. See plan §"Chunk identity across rounds".
 */
function sha(input) {
    return createHash("sha1").update(input).digest("hex").slice(0, 12);
}
/**
 * Hash of the hunk body (added/removed lines only), whitespace-normalized and
 * with line numbers stripped. Identical content => identical hash, even if the
 * hunk moved within the file. Drives the Tier-1 "unchanged" fast path.
 */
export function contentHash(file, patch) {
    const body = patch
        .split("\n")
        .filter((l) => l.startsWith("+") || l.startsWith("-"))
        .filter((l) => !l.startsWith("+++") && !l.startsWith("---"))
        // Trim only leading/trailing whitespace per line: absorbs reindentation
        // (e.g. a moved block re-indented) while a real internal edit stays a
        // distinct hash and is treated as a revision (Tier 2), not "unchanged".
        .map((l) => l[0] + l.slice(1).trim())
        .join("\n");
    return sha(`${file}\n${body}`);
}
/**
 * Hash of the file path + the `@@` section context (e.g. the enclosing
 * function signature git emits). Same locus, possibly changed body. Drives the
 * Tier-2 "revised" match.
 */
export function headerHash(file, section) {
    const norm = section.replace(/\s+/g, " ").trim();
    return sha(`${file}\n${norm}`);
}
export function makeAnchor(file, hunk) {
    return {
        headerHash: headerHash(file, hunk.section),
        contentHash: contentHash(file, hunk.patch),
        newStartLine: hunk.newStart,
        oldStartLine: hunk.oldStart,
    };
}
/**
 * Match freshly-computed candidate chunks against the existing (prior-round)
 * chunk set. Greedy, one-to-one. Returns a decision for each candidate.
 *
 * Priority ladder:
 *  Tier 1 — contentHash match (same file): unchanged, carry decision.
 *  Tier 2 — headerHash match (same file, non-empty section): revised.
 *  Tier 3 — fuzzy locus: same file + newStartLine within a small window.
 *  none   — brand-new chunk.
 *
 * (Tier 0, agent-forced stableId carry, is handled in merge.ts before this
 * runs, by seeding `forcedByLocus`.)
 */
export function matchCandidates(candidates, existing, opts = {}) {
    const lineWindow = opts.lineWindow ?? 8;
    const used = new Set(); // existing stableIds already claimed
    const results = [];
    const byContent = new Map();
    const byHeader = new Map();
    for (const c of existing) {
        if (c.absent)
            continue;
        push(byContent, `${c.file}::${c.anchor.contentHash}`, c);
        if (c.anchor.headerHash)
            push(byHeader, `${c.file}::${c.anchor.headerHash}`, c);
    }
    // Tier 1 pass first (highest confidence), then Tier 2, then Tier 3.
    const pending = candidates.map((c, i) => ({ c, i }));
    const claim = (i, chunk, tier, unchanged) => {
        if (chunk)
            used.add(chunk.stableId);
        results.push({
            candidateIndex: i,
            existingStableId: chunk ? chunk.stableId : null,
            tier,
            unchanged,
        });
    };
    const resolved = new Set();
    // Tier 1: content hash
    for (const { c, i } of pending) {
        const key = `${c.file}::${c.anchor.contentHash}`;
        const pool = (byContent.get(key) ?? []).filter((x) => !used.has(x.stableId));
        if (pool.length >= 1) {
            claim(i, pool[0], 1, true);
            resolved.add(i);
        }
    }
    // Tier 2: header hash (non-empty section)
    for (const { c, i } of pending) {
        if (resolved.has(i))
            continue;
        if (!c.anchor.headerHash)
            continue;
        const key = `${c.file}::${c.anchor.headerHash}`;
        const pool = (byHeader.get(key) ?? []).filter((x) => !used.has(x.stableId));
        // Only accept a header match when it is unambiguous in the remaining pool.
        if (pool.length === 1) {
            claim(i, pool[0], 2, false);
            resolved.add(i);
        }
    }
    // Tier 3: fuzzy locus (same file, nearest unclaimed by start line)
    for (const { c, i } of pending) {
        if (resolved.has(i))
            continue;
        const pool = existing
            .filter((x) => !x.absent && x.file === c.file && !used.has(x.stableId))
            .map((x) => ({ x, d: Math.abs(x.anchor.newStartLine - c.anchor.newStartLine) }))
            .filter((p) => p.d <= lineWindow)
            .sort((p, q) => p.d - q.d);
        if (pool.length >= 1) {
            claim(i, pool[0].x, 3, false);
            resolved.add(i);
        }
    }
    // Remaining: brand-new chunks
    for (const { i } of pending) {
        if (resolved.has(i))
            continue;
        claim(i, null, null, false);
    }
    results.sort((a, b) => a.candidateIndex - b.candidateIndex);
    return results;
}
function push(map, key, v) {
    const arr = map.get(key);
    if (arr)
        arr.push(v);
    else
        map.set(key, [v]);
}
//# sourceMappingURL=identity.js.map
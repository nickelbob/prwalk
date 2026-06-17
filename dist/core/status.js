export function liveChunks(manifest) {
    return manifest.chunks.filter((c) => !c.absent);
}
export function countDecisions(manifest) {
    const live = liveChunks(manifest);
    const counts = {
        accepted: 0,
        rejected: 0,
        pending: 0,
        stale: 0,
        total: live.length,
    };
    for (const c of live) {
        counts[c.decision.state] += 1;
    }
    return counts;
}
/**
 * Derive overall PR status from the current (non-absent) chunk decisions.
 *  - approved: every live chunk accepted
 *  - changes_requested: any live chunk rejected
 *  - in_review: some decided, some pending (and none rejected)
 *  - draft: nothing decided yet (all pending)
 */
export function deriveStatus(manifest) {
    const counts = countDecisions(manifest);
    if (counts.total === 0)
        return "approved"; // empty diff: vacuously approved
    if (counts.rejected > 0)
        return "changes_requested";
    if (counts.accepted === counts.total)
        return "approved";
    if (counts.accepted === 0 && counts.stale === 0)
        return "draft";
    return "in_review";
}
//# sourceMappingURL=status.js.map
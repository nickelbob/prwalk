import { countDecisions, deriveStatus, liveChunks } from "./status.js";
export function buildStatusReport(manifest, liveHeadSha) {
    const live = liveChunks(manifest);
    const rejected = live
        .filter((c) => c.decision.state === "rejected")
        .map((c) => ({
        stableId: c.stableId,
        file: c.file,
        revisionId: c.revisionId,
        description: c.description,
        risk: c.risk,
        feedback: c.decision.feedback,
    }));
    const pending = live
        .filter((c) => c.decision.state === "pending")
        .map((c) => ({
        stableId: c.stableId,
        file: c.file,
        revisionId: c.revisionId,
        description: c.description,
        risk: c.risk,
    }));
    const autoAccepted = live.filter((c) => c.decision.state === "accepted" && c.decision.via === "auto-threshold").length;
    const stale = liveHeadSha !== null && liveHeadSha !== manifest.pr.headSha;
    return {
        branch: manifest.pr.branch,
        round: manifest.pr.currentRound,
        status: deriveStatus(manifest),
        counts: countDecisions(manifest),
        reviewLevel: manifest.pr.reviewLevel,
        autoAccepted,
        rejected,
        pending,
        stale,
        headShaAtCreate: manifest.pr.headSha,
        liveHeadSha,
    };
}
export function suggestCommitMessage(manifest) {
    const counts = countDecisions(manifest);
    const status = deriveStatus(manifest);
    const verb = status === "approved"
        ? "approve"
        : status === "changes_requested"
            ? "request changes on"
            : "review";
    return `prwalk(review): ${verb} ${manifest.pr.branch} round ${manifest.pr.currentRound} (${counts.accepted} accepted, ${counts.rejected} changes requested, ${counts.pending} pending)`;
}
//# sourceMappingURL=report.js.map
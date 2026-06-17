import { matchCandidates } from "./identity.js";
import { SCHEMA_VERSION } from "./schema.js";
import { eventId, nowIso, shortId, uuid } from "./util.js";
function pendingDecision(round, revisionId) {
    return {
        state: "pending",
        round,
        feedback: null,
        via: "explicit",
        appliesToRevisionId: revisionId,
        decidedAt: null,
    };
}
function newChunk(c, round, order, lineage = []) {
    const stableId = shortId("chk");
    const revisionId = `rev_r${round}_${shortId("x").slice(2)}`;
    return {
        stableId,
        revisionId,
        round,
        file: c.file,
        previousFile: c.previousFile,
        changeType: c.changeType,
        language: c.language,
        order,
        sectionId: null,
        sectionOrder: 0,
        anchor: c.anchor,
        diff: c.diff,
        description: "",
        risk: c.risk,
        decision: pendingDecision(round, revisionId),
        lineage,
        absent: false,
    };
}
/**
 * Build a fresh round-1 manifest from candidate chunks.
 */
export function buildInitialManifest(candidates, meta) {
    const createdAt = nowIso();
    const round = 1;
    const chunks = candidates.map((c, i) => newChunk(c, round, i));
    let counter = 0;
    const events = chunks.map((ch) => ({
        id: eventId(counter++),
        ts: createdAt,
        round,
        type: "revision",
        chunkStableId: ch.stableId,
        revisionId: ch.revisionId,
        file: ch.file,
        patch: ch.diff.patch,
        supersedes: null,
    }));
    const manifest = {
        schemaVersion: SCHEMA_VERSION,
        pr: {
            id: uuid(),
            branch: meta.branch,
            baseRef: meta.baseRef,
            baseSha: meta.baseSha,
            headSha: meta.headSha,
            title: meta.title ?? "",
            description: "",
            createdAt,
            updatedAt: createdAt,
            currentRound: round,
            reviewLevel: null,
            issueKey: meta.issueKey ?? null,
            issueUrl: meta.issueUrl ?? null,
            tracker: meta.tracker ?? null,
        },
        rounds: [
            { round, baseSha: meta.baseSha, headSha: meta.headSha, createdAt },
        ],
        sections: [],
        chunks,
        events,
    };
    return {
        manifest,
        counts: { new: chunks.length, revised: 0, unchanged: 0, absent: 0, total: chunks.length },
    };
}
/**
 * Merge fresh candidate chunks into an existing manifest, producing a new
 * round. Carries decisions + agent annotations for unchanged/revised chunks,
 * resets revised chunks to pending, and marks vanished chunks absent.
 */
export function mergeRound(existing, candidates, meta) {
    const createdAt = nowIso();
    const round = existing.pr.currentRound + 1;
    const matches = matchCandidates(candidates, existing.chunks);
    const byStableId = new Map(existing.chunks.map((c) => [c.stableId, c]));
    let counter = existing.events.length;
    const newEvents = [];
    const addRevisionEvent = (ch, supersedes) => {
        newEvents.push({
            id: eventId(counter++),
            ts: createdAt,
            round,
            type: "revision",
            chunkStableId: ch.stableId,
            revisionId: ch.revisionId,
            file: ch.file,
            patch: ch.diff.patch,
            supersedes,
        });
    };
    const maxOrder = existing.chunks.reduce((m, c) => Math.max(m, c.order), -1);
    let nextOrder = maxOrder + 1;
    const counts = { new: 0, revised: 0, unchanged: 0, absent: 0, total: 0 };
    const matchedExisting = new Set();
    const resultChunks = [];
    matches.forEach((m) => {
        const cand = candidates[m.candidateIndex];
        if (m.existingStableId) {
            const prev = byStableId.get(m.existingStableId);
            matchedExisting.add(prev.stableId);
            if (m.unchanged) {
                // Tier 1: same content. Keep decision + annotations, refresh anchors.
                resultChunks.push({
                    ...prev,
                    round,
                    file: cand.file,
                    previousFile: cand.previousFile,
                    changeType: cand.changeType,
                    language: cand.language,
                    anchor: cand.anchor,
                    diff: cand.diff,
                    absent: false,
                });
                counts.unchanged++;
            }
            else {
                // Tier 2/3: revised. Carry stableId + annotations, reset to pending.
                const revisionId = `rev_r${round}_${shortId("x").slice(2)}`;
                const revised = {
                    ...prev,
                    revisionId,
                    round,
                    file: cand.file,
                    previousFile: cand.previousFile,
                    changeType: cand.changeType,
                    language: cand.language,
                    anchor: cand.anchor,
                    diff: cand.diff,
                    decision: pendingDecision(round, revisionId),
                    absent: false,
                };
                resultChunks.push(revised);
                addRevisionEvent(revised, prev.revisionId);
                counts.revised++;
            }
        }
        else {
            // Brand-new chunk.
            const ch = newChunk(cand, round, nextOrder++);
            resultChunks.push(ch);
            addRevisionEvent(ch, null);
            counts.new++;
        }
    });
    // Existing chunks with no match this round -> absent (kept for history).
    for (const prev of existing.chunks) {
        if (matchedExisting.has(prev.stableId))
            continue;
        if (prev.absent) {
            resultChunks.push(prev); // already absent, leave as-is
            continue;
        }
        resultChunks.push({ ...prev, absent: true });
        newEvents.push({
            id: eventId(counter++),
            ts: createdAt,
            round,
            type: "meta",
            chunkStableId: prev.stableId,
            kind: "absent",
            detail: { reason: "no longer present in diff" },
        });
        counts.absent++;
    }
    resultChunks.sort((a, b) => a.order - b.order);
    counts.total = resultChunks.filter((c) => !c.absent).length;
    const round_ = {
        round,
        baseSha: meta.baseSha,
        headSha: meta.headSha,
        createdAt,
    };
    const manifest = {
        ...existing,
        pr: {
            ...existing.pr,
            baseRef: meta.baseRef,
            baseSha: meta.baseSha,
            headSha: meta.headSha,
            title: meta.title ?? existing.pr.title,
            updatedAt: createdAt,
            currentRound: round,
            // Refresh correlation if this run resolved one; otherwise keep prior.
            issueKey: meta.issueKey ?? existing.pr.issueKey,
            issueUrl: meta.issueUrl ?? existing.pr.issueUrl,
            tracker: meta.tracker ?? existing.pr.tracker,
        },
        rounds: [...existing.rounds, round_],
        chunks: resultChunks,
        events: [...existing.events, ...newEvents],
    };
    return { manifest, counts };
}
//# sourceMappingURL=merge.js.map
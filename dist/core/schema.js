import { z } from "zod";
/**
 * The prwalk audit-log schema. This is the single source of truth for a
 * review: it is self-contained (embeds diff content), append-only for history,
 * and committed into the reviewed repo at `.prwalk/<branch>.json`.
 *
 * Three conceptual layers:
 *  - `pr` / `rounds` / `sections`: metadata + structure
 *  - `chunks`: the CURRENT rendered set (latest version of each live chunk)
 *  - `events`: append-only audit trail (every revision + every decision)
 */
export const SCHEMA_VERSION = 1;
export const ChangeType = z.enum([
    "add",
    "modify",
    "delete",
    "rename",
    "binary",
    "mode",
]);
export const DecisionState = z.enum([
    "pending",
    "accepted",
    "rejected",
    "stale",
]);
export const PrStatus = z.enum([
    "draft",
    "in_review",
    "changes_requested",
    "approved",
]);
export const Anchor = z.object({
    headerHash: z.string(),
    contentHash: z.string(),
    newStartLine: z.number().int(),
    oldStartLine: z.number().int(),
});
export const ChunkDiff = z.object({
    format: z.literal("unified"),
    hunkHeader: z.string(),
    patch: z.string(),
    addedLines: z.number().int(),
    removedLines: z.number().int(),
    truncated: z.boolean().default(false),
});
/** How a decision was reached: by the reviewer, or auto-accepted below the
 * chosen review level (not individually reviewed). */
export const DecisionVia = z.enum(["explicit", "auto-threshold"]);
export const Decision = z.object({
    state: DecisionState,
    round: z.number().int(),
    feedback: z.string().nullable().default(null),
    via: DecisionVia.default("explicit"),
    appliesToRevisionId: z.string().nullable().default(null),
    decidedAt: z.string().nullable().default(null),
});
/** Risk level the PR creator assigns to a chunk: 1 trivial … 5 critical. */
export const Risk = z.number().int().min(1).max(5);
export const Chunk = z.object({
    stableId: z.string(),
    revisionId: z.string(),
    round: z.number().int(),
    file: z.string(),
    previousFile: z.string().nullable().default(null),
    changeType: ChangeType,
    language: z.string(),
    order: z.number().int(),
    sectionId: z.string().nullable().default(null),
    sectionOrder: z.number().int().default(0),
    anchor: Anchor,
    diff: ChunkDiff,
    description: z.string().default(""),
    risk: Risk.default(3),
    decision: Decision,
    lineage: z.array(z.string()).default([]),
    absent: z.boolean().default(false),
});
export const Section = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().default(""),
    order: z.number().int(),
});
export const Round = z.object({
    round: z.number().int(),
    baseSha: z.string(),
    headSha: z.string(),
    createdAt: z.string(),
});
export const PrMeta = z.object({
    id: z.string(),
    branch: z.string(),
    baseRef: z.string(),
    baseSha: z.string(),
    headSha: z.string(),
    title: z.string().default(""),
    description: z.string().default(""),
    createdAt: z.string(),
    updatedAt: z.string(),
    currentRound: z.number().int(),
    /** Minimum risk the reviewer chooses to review one-at-a-time; null until set.
     * Chunks below this are auto-accepted. */
    reviewLevel: Risk.nullable().default(null),
    /** Correlation to an external work tracker (JIRA). Derived from the branch
     * name at create time (or an explicit --issue override); null when absent. */
    issueKey: z.string().nullable().default(null),
    issueUrl: z.string().nullable().default(null),
    tracker: z.enum(["jira"]).nullable().default(null),
});
/** Append-only audit events. */
export const EventBase = z.object({
    id: z.string(),
    ts: z.string(),
    round: z.number().int(),
});
export const RevisionEvent = EventBase.extend({
    type: z.literal("revision"),
    chunkStableId: z.string(),
    revisionId: z.string(),
    file: z.string(),
    patch: z.string(),
    supersedes: z.string().nullable().default(null),
});
export const DecisionEvent = EventBase.extend({
    type: z.literal("decision"),
    chunkStableId: z.string(),
    revisionId: z.string(),
    action: z.enum(["accept", "reject"]),
    feedback: z.string().nullable().default(null),
    via: DecisionVia.default("explicit"),
    actor: z.enum(["developer", "agent"]).default("developer"),
});
export const MetaEvent = EventBase.extend({
    type: z.literal("meta"),
    chunkStableId: z.string().nullable().default(null),
    kind: z.string(), // e.g. "absent", "merged_into", "split_into", "resolved"
    detail: z.record(z.unknown()).default({}),
});
export const AuditEvent = z.discriminatedUnion("type", [
    RevisionEvent,
    DecisionEvent,
    MetaEvent,
]);
export const Manifest = z.object({
    schemaVersion: z.number().int(),
    pr: PrMeta,
    rounds: z.array(Round),
    sections: z.array(Section).default([]),
    chunks: z.array(Chunk),
    events: z.array(AuditEvent),
});
/**
 * Validate + migrate a parsed manifest object. Throws on an unknown future
 * schema version (forward-incompatible) or on validation failure.
 */
export function parseManifest(raw) {
    const obj = raw;
    const version = obj?.schemaVersion ?? 0;
    if (version > SCHEMA_VERSION) {
        throw new Error(`prwalk: manifest schemaVersion ${version} is newer than this tool supports (${SCHEMA_VERSION}). Upgrade prwalk.`);
    }
    // Future migrations would run here for version < SCHEMA_VERSION.
    return Manifest.parse(raw);
}
//# sourceMappingURL=schema.js.map
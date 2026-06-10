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
export type ChangeType = z.infer<typeof ChangeType>;

export const DecisionState = z.enum([
  "pending",
  "accepted",
  "rejected",
  "stale",
]);
export type DecisionState = z.infer<typeof DecisionState>;

export const PrStatus = z.enum([
  "draft",
  "in_review",
  "changes_requested",
  "approved",
]);
export type PrStatus = z.infer<typeof PrStatus>;

export const Anchor = z.object({
  headerHash: z.string(),
  contentHash: z.string(),
  newStartLine: z.number().int(),
  oldStartLine: z.number().int(),
});
export type Anchor = z.infer<typeof Anchor>;

export const ChunkDiff = z.object({
  format: z.literal("unified"),
  hunkHeader: z.string(),
  patch: z.string(),
  addedLines: z.number().int(),
  removedLines: z.number().int(),
  truncated: z.boolean().default(false),
});
export type ChunkDiff = z.infer<typeof ChunkDiff>;

export const Decision = z.object({
  state: DecisionState,
  round: z.number().int(),
  feedback: z.string().nullable().default(null),
  appliesToRevisionId: z.string().nullable().default(null),
  decidedAt: z.string().nullable().default(null),
});
export type Decision = z.infer<typeof Decision>;

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
  decision: Decision,
  lineage: z.array(z.string()).default([]),
  absent: z.boolean().default(false),
});
export type Chunk = z.infer<typeof Chunk>;

export const Section = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(""),
  order: z.number().int(),
});
export type Section = z.infer<typeof Section>;

export const Round = z.object({
  round: z.number().int(),
  baseSha: z.string(),
  headSha: z.string(),
  createdAt: z.string(),
});
export type Round = z.infer<typeof Round>;

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
});
export type PrMeta = z.infer<typeof PrMeta>;

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
export type RevisionEvent = z.infer<typeof RevisionEvent>;

export const DecisionEvent = EventBase.extend({
  type: z.literal("decision"),
  chunkStableId: z.string(),
  revisionId: z.string(),
  action: z.enum(["accept", "reject"]),
  feedback: z.string().nullable().default(null),
  actor: z.enum(["developer", "agent"]).default("developer"),
});
export type DecisionEvent = z.infer<typeof DecisionEvent>;

export const MetaEvent = EventBase.extend({
  type: z.literal("meta"),
  chunkStableId: z.string().nullable().default(null),
  kind: z.string(), // e.g. "absent", "merged_into", "split_into", "resolved"
  detail: z.record(z.unknown()).default({}),
});
export type MetaEvent = z.infer<typeof MetaEvent>;

export const AuditEvent = z.discriminatedUnion("type", [
  RevisionEvent,
  DecisionEvent,
  MetaEvent,
]);
export type AuditEvent = z.infer<typeof AuditEvent>;

export const Manifest = z.object({
  schemaVersion: z.number().int(),
  pr: PrMeta,
  rounds: z.array(Round),
  sections: z.array(Section).default([]),
  chunks: z.array(Chunk),
  events: z.array(AuditEvent),
});
export type Manifest = z.infer<typeof Manifest>;

/**
 * Validate + migrate a parsed manifest object. Throws on an unknown future
 * schema version (forward-incompatible) or on validation failure.
 */
export function parseManifest(raw: unknown): Manifest {
  const obj = raw as { schemaVersion?: number };
  const version = obj?.schemaVersion ?? 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(
      `prwalk: manifest schemaVersion ${version} is newer than this tool supports (${SCHEMA_VERSION}). Upgrade prwalk.`,
    );
  }
  // Future migrations would run here for version < SCHEMA_VERSION.
  return Manifest.parse(raw);
}

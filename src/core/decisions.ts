import type { AuditEvent, Chunk, Manifest } from "./schema.js";
import { eventId, nowIso } from "./util.js";

export interface DecisionInput {
  stableId: string;
  revisionId: string;
  action: "accept" | "reject";
  feedback?: string | null;
  actor?: "developer" | "agent";
}

export interface ApplyResult {
  manifest: Manifest;
  chunk: Chunk;
}

/**
 * Apply an accept/reject decision to a chunk: append a decision event and
 * update the chunk's denormalized `decision` projection. Pure (returns a new
 * manifest); persistence is the caller's responsibility.
 */
export function applyDecision(
  manifest: Manifest,
  input: DecisionInput,
): ApplyResult {
  const idx = manifest.chunks.findIndex((c) => c.stableId === input.stableId);
  if (idx === -1) {
    throw new Error(`prwalk: unknown chunk ${input.stableId}`);
  }
  const chunk = manifest.chunks[idx];
  if (chunk.revisionId !== input.revisionId) {
    throw new Error(
      `prwalk: stale decision for ${input.stableId} (expected revision ${chunk.revisionId}, got ${input.revisionId}). Reload the review.`,
    );
  }

  const ts = nowIso();
  const round = manifest.pr.currentRound;
  const feedback = input.action === "reject" ? input.feedback ?? "" : null;

  const event: AuditEvent = {
    id: eventId(manifest.events.length),
    ts,
    round,
    type: "decision",
    chunkStableId: chunk.stableId,
    revisionId: chunk.revisionId,
    action: input.action,
    feedback,
    actor: input.actor ?? "developer",
  };

  const updatedChunk: Chunk = {
    ...chunk,
    decision: {
      state: input.action === "accept" ? "accepted" : "rejected",
      round,
      feedback,
      appliesToRevisionId: chunk.revisionId,
      decidedAt: ts,
    },
  };

  const chunks = manifest.chunks.slice();
  chunks[idx] = updatedChunk;

  return {
    manifest: {
      ...manifest,
      chunks,
      events: [...manifest.events, event],
      pr: { ...manifest.pr, updatedAt: ts },
    },
    chunk: updatedChunk,
  };
}

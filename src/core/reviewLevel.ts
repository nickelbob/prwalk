import type { AuditEvent, Chunk, Manifest } from "./schema.js";
import { eventId, nowIso } from "./util.js";

/** Human labels for the 1–5 risk scale. */
export const RISK_LABELS: Record<number, string> = {
  1: "trivial",
  2: "low",
  3: "moderate",
  4: "high",
  5: "critical",
};

export function riskLabel(risk: number): string {
  return RISK_LABELS[risk] ?? `risk ${risk}`;
}

/** A chunk is "in scope" for one-at-a-time review at `level` when its risk is
 * at or above the level. Below-level chunks are auto-accepted. */
export function inScope(chunk: Chunk, level: number | null): boolean {
  if (level === null) return true; // no level chosen yet → everything is in scope
  return chunk.risk >= level;
}

/** True once the reviewer has explicitly decided a chunk (sticky across level
 * changes). */
export function isExplicit(chunk: Chunk): boolean {
  return (
    (chunk.decision.state === "accepted" || chunk.decision.state === "rejected") &&
    chunk.decision.via === "explicit"
  );
}

export interface LevelSummary {
  level: number;
  inScope: number; // chunks the reviewer will see one-at-a-time
  autoAccepted: number; // below-level chunks auto-accepted this call (now total below-level)
  reopened: number; // previously auto-accepted chunks brought back into scope
}

export interface ApplyLevelResult {
  manifest: Manifest;
  summary: LevelSummary;
}

/**
 * Set the reviewer's review level and re-partition non-explicit chunks:
 *  - risk >= level  → pending (in scope; reopened if it was auto-accepted)
 *  - risk <  level  → accepted via "auto-threshold" (not individually reviewed)
 * Explicit decisions (the reviewer actually clicked accept/reject) are never
 * touched. Appends decision events for auto-accepts and a meta event for the
 * level change, keeping the audit trail honest.
 */
export function applyReviewLevel(
  manifest: Manifest,
  level: number,
): ApplyLevelResult {
  const ts = nowIso();
  const round = manifest.pr.currentRound;
  let counter = manifest.events.length;
  const newEvents: AuditEvent[] = [];

  let autoAccepted = 0;
  let reopened = 0;
  let inScopeCount = 0;

  const chunks = manifest.chunks.map((chunk): Chunk => {
    if (chunk.absent) return chunk;
    if (isExplicit(chunk)) {
      if (inScope(chunk, level)) inScopeCount++;
      return chunk;
    }

    if (chunk.risk >= level) {
      inScopeCount++;
      // Reopen a previously auto-accepted chunk now back in scope.
      if (chunk.decision.state === "accepted" && chunk.decision.via === "auto-threshold") {
        reopened++;
        newEvents.push({
          id: eventId(counter++),
          ts,
          round,
          type: "meta",
          chunkStableId: chunk.stableId,
          kind: "reopened_level_raised",
          detail: { level, risk: chunk.risk },
        });
        return {
          ...chunk,
          decision: {
            state: "pending",
            round,
            feedback: null,
            via: "explicit",
            appliesToRevisionId: chunk.revisionId,
            decidedAt: null,
          },
        };
      }
      return chunk; // already pending
    }

    // Below level → auto-accept (if not already).
    if (chunk.decision.state === "accepted" && chunk.decision.via === "auto-threshold") {
      autoAccepted++;
      return chunk; // already auto-accepted
    }
    autoAccepted++;
    newEvents.push({
      id: eventId(counter++),
      ts,
      round,
      type: "decision",
      chunkStableId: chunk.stableId,
      revisionId: chunk.revisionId,
      action: "accept",
      feedback: null,
      via: "auto-threshold",
      actor: "developer",
    });
    return {
      ...chunk,
      decision: {
        state: "accepted",
        round,
        feedback: null,
        via: "auto-threshold",
        appliesToRevisionId: chunk.revisionId,
        decidedAt: ts,
      },
    };
  });

  newEvents.push({
    id: eventId(counter++),
    ts,
    round,
    type: "meta",
    chunkStableId: null,
    kind: "review_level_set",
    detail: { level, inScope: inScopeCount, autoAccepted, reopened },
  });

  return {
    manifest: {
      ...manifest,
      pr: { ...manifest.pr, reviewLevel: level, updatedAt: ts },
      chunks,
      events: [...manifest.events, ...newEvents],
    },
    summary: { level, inScope: inScopeCount, autoAccepted, reopened },
  };
}

/** Count of live chunks at each risk level (1–5). */
export function riskDistribution(manifest: Manifest): Record<number, number> {
  const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const c of manifest.chunks) {
    if (c.absent) continue;
    dist[c.risk] = (dist[c.risk] ?? 0) + 1;
  }
  return dist;
}

import type { Chunk, Manifest, PrStatus } from "./schema.js";

export interface StatusCounts {
  accepted: number;
  rejected: number;
  pending: number;
  stale: number;
  total: number;
}

export function liveChunks(manifest: Manifest): Chunk[] {
  return manifest.chunks.filter((c) => !c.absent);
}

export function countDecisions(manifest: Manifest): StatusCounts {
  const live = liveChunks(manifest);
  const counts: StatusCounts = {
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
export function deriveStatus(manifest: Manifest): PrStatus {
  const counts = countDecisions(manifest);
  if (counts.total === 0) return "approved"; // empty diff: vacuously approved
  if (counts.rejected > 0) return "changes_requested";
  if (counts.accepted === counts.total) return "approved";
  if (counts.accepted === 0 && counts.stale === 0) return "draft";
  return "in_review";
}

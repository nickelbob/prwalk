import type { Manifest } from "./schema.js";
import { countDecisions, deriveStatus, liveChunks, type StatusCounts } from "./status.js";

export interface ChunkBrief {
  stableId: string;
  file: string;
  revisionId: string;
  description: string;
  risk: number;
  feedback?: string | null;
}

export interface StatusReport {
  branch: string;
  round: number;
  status: ReturnType<typeof deriveStatus>;
  counts: StatusCounts;
  reviewLevel: number | null;
  autoAccepted: number;
  rejected: ChunkBrief[];
  pending: ChunkBrief[];
  stale: boolean;
  headShaAtCreate: string;
  liveHeadSha: string | null;
}

export function buildStatusReport(
  manifest: Manifest,
  liveHeadSha: string | null,
): StatusReport {
  const live = liveChunks(manifest);
  const rejected: ChunkBrief[] = live
    .filter((c) => c.decision.state === "rejected")
    .map((c) => ({
      stableId: c.stableId,
      file: c.file,
      revisionId: c.revisionId,
      description: c.description,
      risk: c.risk,
      feedback: c.decision.feedback,
    }));
  const pending: ChunkBrief[] = live
    .filter((c) => c.decision.state === "pending")
    .map((c) => ({
      stableId: c.stableId,
      file: c.file,
      revisionId: c.revisionId,
      description: c.description,
      risk: c.risk,
    }));
  const autoAccepted = live.filter(
    (c) => c.decision.state === "accepted" && c.decision.via === "auto-threshold",
  ).length;

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

export function suggestCommitMessage(manifest: Manifest): string {
  const counts = countDecisions(manifest);
  const status = deriveStatus(manifest);
  const verb =
    status === "approved"
      ? "approve"
      : status === "changes_requested"
        ? "request changes on"
        : "review";
  return `prwalk(review): ${verb} ${manifest.pr.branch} round ${manifest.pr.currentRound} (${counts.accepted} accepted, ${counts.rejected} changes requested, ${counts.pending} pending)`;
}

// Client-side mirror of the manifest shapes the UI consumes. Kept as plain
// interfaces (no zod) so the client bundle stays lean.

export type DecisionState = "pending" | "accepted" | "rejected" | "stale";
export type PrStatus = "draft" | "in_review" | "changes_requested" | "approved";
export type ChangeType = "add" | "modify" | "delete" | "rename" | "binary" | "mode";

export interface Decision {
  state: DecisionState;
  round: number;
  feedback: string | null;
  appliesToRevisionId: string | null;
  decidedAt: string | null;
}

export interface Chunk {
  stableId: string;
  revisionId: string;
  round: number;
  file: string;
  previousFile: string | null;
  changeType: ChangeType;
  language: string;
  order: number;
  sectionId: string | null;
  sectionOrder: number;
  diff: {
    format: "unified";
    hunkHeader: string;
    patch: string;
    addedLines: number;
    removedLines: number;
    truncated: boolean;
  };
  description: string;
  decision: Decision;
  lineage: string[];
  absent: boolean;
}

export interface Section {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface PrMeta {
  id: string;
  branch: string;
  baseRef: string;
  baseSha: string;
  headSha: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  currentRound: number;
}

export interface AuditEvent {
  id: string;
  ts: string;
  round: number;
  type: "revision" | "decision" | "meta";
  chunkStableId?: string | null;
  revisionId?: string;
  action?: "accept" | "reject";
  feedback?: string | null;
  patch?: string;
  supersedes?: string | null;
  kind?: string;
}

export interface Manifest {
  schemaVersion: number;
  pr: PrMeta;
  rounds: { round: number; baseSha: string; headSha: string; createdAt: string }[];
  sections: Section[];
  chunks: Chunk[];
  events: AuditEvent[];
}

export interface StatusCounts {
  accepted: number;
  rejected: number;
  pending: number;
  stale: number;
  total: number;
}

export interface ReviewResponse {
  manifest: Manifest;
  status: PrStatus;
  counts: StatusCounts;
  stale: boolean;
  liveHeadSha: string | null;
}

export interface DecisionResponse {
  chunk: Chunk;
  status: PrStatus;
  counts: StatusCounts;
}

export interface ReviewListItem {
  slug: string;
  branch: string;
  title: string;
  round: number;
  status: PrStatus;
  counts: StatusCounts;
}

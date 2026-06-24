import { useState } from "react";
import type { PrMeta, PrStatus, StatusCounts } from "../types.js";
import { fetchCommitMessage } from "../api.js";
import { CollapsibleDescription } from "./CollapsibleDescription.js";

const STATUS_LABEL: Record<PrStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export function StatusBar({
  pr,
  status,
  counts,
  stale,
  slug,
}: {
  pr: PrMeta;
  status: PrStatus;
  counts: StatusCounts;
  stale: boolean;
  slug: string;
}) {
  const [commitMsg, setCommitMsg] = useState<string | null>(null);
  const reviewed = counts.accepted + counts.rejected;
  const pct = counts.total ? Math.round((reviewed / counts.total) * 100) : 100;

  const showCommit = async () => {
    setCommitMsg(await fetchCommitMessage(slug));
  };

  return (
    <header className="statusbar">
      <div className="sb-top">
        <h1>{pr.title || pr.branch}</h1>
        <span className={`pr-status ${status}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="sb-meta">
        <code>{pr.branch}</code> ← <code>{pr.baseRef}</code> · round {pr.currentRound}
      </div>
      <CollapsibleDescription text={pr.description} />
      {stale && (
        <div className="stale-banner">
          ⚠ Branch advanced since this review was generated — ask the agent to re-run{" "}
          <code>prwalk create</code>.
        </div>
      )}
      <div className="sb-progress">
        <div className="bar">
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="counts">
          {counts.accepted}✓ · {counts.rejected}✗ · {counts.pending} pending / {counts.total}
        </span>
      </div>
      <div className="sb-actions">
        <button className="btn ghost" onClick={showCommit}>
          Suggested commit message
        </button>
        {commitMsg && <code className="commit-msg">{commitMsg}</code>}
      </div>
    </header>
  );
}

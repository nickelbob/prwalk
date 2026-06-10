import { useState } from "react";
import type { Chunk } from "../types.js";
import { DiffView } from "./DiffView.js";
import { HistoryPanel } from "./HistoryPanel.js";

export interface ChunkCardProps {
  chunk: Chunk;
  slug: string;
  active: boolean;
  busy: boolean;
  readOnly: boolean;
  onAccept: () => void;
  onReject: (feedback: string) => void;
  onActivate: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
}

export function ChunkCard(props: ChunkCardProps) {
  const { chunk, active, busy, readOnly } = props;
  const [rejecting, setRejecting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [feedback, setFeedback] = useState(chunk.decision.feedback ?? "");

  const state = chunk.decision.state;
  const stats = `+${chunk.diff.addedLines} -${chunk.diff.removedLines}`;

  const submitReject = () => {
    props.onReject(feedback.trim());
    setRejecting(false);
  };

  return (
    <div
      ref={props.registerRef}
      className={`chunk ${state} ${active ? "active" : ""}`}
      onClick={props.onActivate}
    >
      <div className="chunk-head">
        <span className={`badge ${state}`}>{state}</span>
        <span className="file">{chunk.file}</span>
        {chunk.changeType !== "modify" && (
          <span className="change-type">{chunk.changeType}</span>
        )}
        <span className="stats">{stats}</span>
        {chunk.round > 1 || chunk.lineage.length > 0 ? (
          <button
            className="hist-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setShowHistory((v) => !v);
            }}
          >
            history
          </button>
        ) : null}
      </div>
      {showHistory && (
        <div onClick={(e) => e.stopPropagation()}>
          <HistoryPanel slug={props.slug} stableId={chunk.stableId} />
        </div>
      )}

      {chunk.description ? (
        <p className="desc">{chunk.description}</p>
      ) : (
        <p className="desc muted">No description provided.</p>
      )}

      <DiffView patch={chunk.diff.patch} language={chunk.language} />
      {chunk.diff.truncated && (
        <p className="muted">Large hunk truncated for display; full text is in the audit log.</p>
      )}

      {state === "rejected" && chunk.decision.feedback && !rejecting && (
        <div className="prior-feedback">
          <strong>Your feedback:</strong> {chunk.decision.feedback}
        </div>
      )}

      {rejecting ? (
        <div className="reject-box" onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            placeholder="What do you want instead?"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReject();
              if (e.key === "Escape") setRejecting(false);
            }}
          />
          <div className="reject-actions">
            <button className="btn reject" disabled={busy} onClick={submitReject}>
              Submit rejection
            </button>
            <button className="btn ghost" onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <span className="hint">⌘/Ctrl+Enter to submit · Esc to cancel</span>
          </div>
        </div>
      ) : (
        <div className="chunk-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn accept"
            disabled={busy || readOnly}
            onClick={props.onAccept}
          >
            {state === "accepted" ? "Accepted ✓" : "Accept"}
          </button>
          <button
            className="btn reject"
            disabled={busy || readOnly}
            onClick={() => setRejecting(true)}
          >
            {state === "rejected" ? "Edit rejection" : "Reject…"}
          </button>
          {readOnly && <span className="hint">read-only</span>}
        </div>
      )}
    </div>
  );
}

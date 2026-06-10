import { useEffect, useMemo, useState } from "react";
import type { Chunk, Manifest, StatusCounts } from "../types.js";
import { ChunkCard } from "./ChunkCard.js";
import { RiskBadge } from "./RiskBadge.js";
import { fetchCommitMessage } from "../api.js";

/** In-scope chunks (risk ≥ level), ordered by section then order. */
function buildQueue(manifest: Manifest, level: number): Chunk[] {
  const live = manifest.chunks.filter((c) => !c.absent && c.risk >= level);
  const secOrder = new Map(manifest.sections.map((s) => [s.id, s.order]));
  return live.sort((a, b) => {
    const sa = a.sectionId ? secOrder.get(a.sectionId) ?? 999 : 999;
    const sb = b.sectionId ? secOrder.get(b.sectionId) ?? 999 : 999;
    return sa - sb || a.sectionOrder - b.sectionOrder || a.order - b.order;
  });
}

export function FocusedReview({
  manifest,
  slug,
  level,
  readOnly,
  busy,
  counts,
  decide,
  onChangeLevel,
  onOverview,
}: {
  manifest: Manifest;
  slug: string;
  level: number;
  readOnly: boolean;
  busy: Set<string>;
  counts: StatusCounts;
  decide: (chunk: Chunk, action: "accept" | "reject", feedback?: string) => Promise<void>;
  onChangeLevel: () => void;
  onOverview: () => void;
}) {
  const queue = useMemo(() => buildQueue(manifest, level), [manifest, level]);
  const [idx, setIdx] = useState(0);
  const sections = useMemo(
    () => new Map(manifest.sections.map((s) => [s.id, s])),
    [manifest],
  );

  const isPending = (c: Chunk) => c.decision.state === "pending";
  const decided = queue.filter((c) => !isPending(c)).length;
  const total = queue.length;
  const allDone = total > 0 && decided === total;

  // Land on the first undecided chunk when the queue changes.
  useEffect(() => {
    const first = queue.findIndex(isPending);
    setIdx(first === -1 ? 0 : first);
  }, [queue.length, level]);

  const current = queue[Math.min(idx, Math.max(0, queue.length - 1))];

  const advance = () => {
    // Prefer the next still-pending chunk after the current position.
    const after = queue.findIndex((c, i) => i > idx && isPending(c));
    if (after !== -1) return setIdx(after);
    const anyPending = queue.findIndex(isPending);
    if (anyPending !== -1) return setIdx(anyPending);
    // none pending → leave index; completion screen will show
  };

  const onAccept = async () => {
    if (!current) return;
    await decide(current, "accept");
    advance();
  };
  const onReject = async (feedback: string) => {
    if (!current) return;
    await decide(current, "reject", feedback);
    advance();
  };

  // Keyboard: a accept · arrows / j k navigate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if ((e.key === "ArrowRight" || e.key === "j") && idx < queue.length - 1) setIdx(idx + 1);
      else if ((e.key === "ArrowLeft" || e.key === "k") && idx > 0) setIdx(idx - 1);
      else if (e.key === "a" && !readOnly && current) void onAccept();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, queue, current, readOnly]);

  if (total === 0) {
    return (
      <Completion
        slug={slug}
        counts={counts}
        emptyAtLevel={level}
        onChangeLevel={onChangeLevel}
        onOverview={onOverview}
      />
    );
  }

  if (allDone) {
    return (
      <Completion
        slug={slug}
        counts={counts}
        onChangeLevel={onChangeLevel}
        onOverview={onOverview}
        onReviewAgain={() => setIdx(0)}
      />
    );
  }

  const section = current?.sectionId ? sections.get(current.sectionId) : undefined;
  const pct = total ? Math.round((decided / total) * 100) : 100;

  return (
    <div className="focused">
      <div className="focus-bar">
        <div className="focus-progress">
          <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
          <span>{decided} / {total} reviewed at level {level}+</span>
        </div>
        <div className="focus-actions">
          <button className="btn ghost" onClick={onChangeLevel}>change level</button>
          <button className="btn ghost" onClick={onOverview}>overview</button>
        </div>
      </div>

      {section && (
        <div className="focus-section">
          <strong>{section.title}</strong>
          {section.description && <span> — {section.description}</span>}
        </div>
      )}

      <div className="focus-pos">
        Chunk {idx + 1} of {total} <RiskBadge risk={current.risk} />
      </div>

      {current && (
        <ChunkCard
          key={current.stableId}
          chunk={current}
          slug={slug}
          active
          busy={busy.has(current.stableId)}
          readOnly={readOnly}
          onAccept={onAccept}
          onReject={onReject}
          onActivate={() => {}}
          registerRef={() => {}}
        />
      )}

      <div className="focus-nav">
        <button className="btn ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          ← prev
        </button>
        <span className="hint">a accept · ← → navigate</span>
        <button
          className="btn ghost"
          disabled={idx >= queue.length - 1}
          onClick={() => setIdx(idx + 1)}
        >
          next →
        </button>
      </div>
    </div>
  );
}

function Completion({
  slug,
  counts,
  emptyAtLevel,
  onChangeLevel,
  onOverview,
  onReviewAgain,
}: {
  slug: string;
  counts: StatusCounts;
  emptyAtLevel?: number;
  onChangeLevel: () => void;
  onOverview: () => void;
  onReviewAgain?: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    fetchCommitMessage(slug).then(setMsg).catch(() => {});
  }, [slug]);

  return (
    <div className="completion">
      <div className="check">✓</div>
      <h2>
        {emptyAtLevel
          ? `Nothing to review at level ${emptyAtLevel}+`
          : "All chunks at this level reviewed"}
      </h2>
      <p className="muted">
        {counts.accepted} accepted · {counts.rejected} rejected · {counts.pending} pending
      </p>
      {msg && (
        <div className="commit-suggest">
          <span className="muted">Commit the audit log with:</span>
          <code>{msg}</code>
        </div>
      )}
      <div className="completion-actions">
        <button className="btn" onClick={onChangeLevel}>Lower level to review more</button>
        <button className="btn ghost" onClick={onOverview}>See full overview</button>
        {onReviewAgain && (
          <button className="btn ghost" onClick={onReviewAgain}>Revisit chunks</button>
        )}
      </div>
    </div>
  );
}

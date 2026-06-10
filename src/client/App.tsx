import { useCallback, useEffect, useState } from "react";
import type { Chunk, ReviewListItem, ReviewResponse } from "./types.js";
import { fetchReview, fetchReviews, postDecision, postReviewLevel } from "./api.js";
import { StatusBar } from "./components/StatusBar.js";
import { ReviewView } from "./components/ReviewView.js";
import { ReviewGate } from "./components/ReviewGate.js";
import { FocusedReview } from "./components/FocusedReview.js";

type Mode = "gate" | "focused" | "overview";

function slugFromPath(): string | null {
  const m = window.location.pathname.match(/^\/r\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function App() {
  const [slug, setSlug] = useState<string | null>(slugFromPath());

  useEffect(() => {
    const onPop = () => setSlug(slugFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!slug) return <Chooser onPick={(s) => { history.pushState({}, "", `/r/${s}`); setSlug(s); }} />;
  return <Review slug={slug} onBack={() => { history.pushState({}, "", "/"); setSlug(null); }} />;
}

function Chooser({ onPick }: { onPick: (slug: string) => void }) {
  const [items, setItems] = useState<ReviewListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchReviews().then(setItems).catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="centered error">{error}</div>;
  if (!items) return <div className="centered">Loading…</div>;
  if (items.length === 0) return <div className="centered">No reviews yet. Run <code>prwalk create</code>.</div>;
  return (
    <div className="chooser">
      <h1>Reviews</h1>
      <ul>
        {items.map((it) => (
          <li key={it.slug} onClick={() => onPick(it.slug)}>
            <span className={`pr-status ${it.status}`}>{it.status}</span>
            <strong>{it.title || it.branch}</strong>
            <code>{it.branch}</code>
            <span className="muted">
              round {it.round} · {it.counts.accepted}✓ {it.counts.rejected}✗ {it.counts.pending}·
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Review({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<Mode | null>(null);
  const [levelBusy, setLevelBusy] = useState(false);

  const load = useCallback(() => {
    fetchReview(slug)
      .then((d) => {
        setData(d);
        // First load: gate if no level chosen yet, else go straight to focused.
        setMode((m) => m ?? (d.manifest.pr.reviewLevel === null ? "gate" : "focused"));
      })
      .catch((e) => setError(e.message));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const setLevel = async (level: number) => {
    setLevelBusy(true);
    try {
      const res = await postReviewLevel(slug, level);
      setData((prev) =>
        prev
          ? { ...prev, manifest: res.manifest, status: res.status, counts: res.counts }
          : prev,
      );
      setMode("focused");
    } catch (e) {
      alert(`Failed to set level: ${(e as Error).message}`);
    } finally {
      setLevelBusy(false);
    }
  };

  const patchChunk = (updated: Chunk, status?: ReviewResponse["status"], counts?: ReviewResponse["counts"]) => {
    setData((prev) => {
      if (!prev) return prev;
      const chunks = prev.manifest.chunks.map((c) =>
        c.stableId === updated.stableId ? updated : c,
      );
      return {
        ...prev,
        manifest: { ...prev.manifest, chunks },
        status: status ?? prev.status,
        counts: counts ?? prev.counts,
      };
    });
  };

  const decide = async (chunk: Chunk, action: "accept" | "reject", feedback?: string) => {
    if (data?.readOnly) return;
    const prevChunk = chunk;
    setBusy((b) => new Set(b).add(chunk.stableId));
    // Optimistic update.
    patchChunk({
      ...chunk,
      decision: {
        ...chunk.decision,
        state: action === "accept" ? "accepted" : "rejected",
        feedback: feedback ?? null,
      },
    });
    try {
      const res = await postDecision(slug, {
        stableId: chunk.stableId,
        revisionId: chunk.revisionId,
        action,
        feedback,
      });
      patchChunk(res.chunk, res.status, res.counts);
    } catch (e) {
      patchChunk(prevChunk); // rollback
      alert(`Failed to save: ${(e as Error).message}`);
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(prevChunk.stableId);
        return n;
      });
    }
  };

  if (error) return <div className="centered error">{error}</div>;
  if (!data || !mode) return <div className="centered">Loading review…</div>;

  const level = data.manifest.pr.reviewLevel ?? 3;

  return (
    <div className="app">
      <button className="back" onClick={onBack}>← all reviews</button>

      {mode === "gate" ? (
        <ReviewGate manifest={data.manifest} busy={levelBusy} onStart={setLevel} />
      ) : (
        <>
          <StatusBar
            pr={data.manifest.pr}
            status={data.status}
            counts={data.counts}
            stale={data.stale}
            slug={slug}
          />
          {data.readOnly && (
            <div className="readonly-banner">
              Read-only: another prwalk server owns writes for this repo. Stop it (or
              use it) to record decisions here.
            </div>
          )}
          {mode === "focused" ? (
            <FocusedReview
              manifest={data.manifest}
              slug={slug}
              level={level}
              readOnly={data.readOnly}
              busy={busy}
              counts={data.counts}
              decide={decide}
              onChangeLevel={() => setMode("gate")}
              onOverview={() => setMode("overview")}
            />
          ) : (
            <>
              <div className="overview-bar">
                <button className="btn ghost" onClick={() => setMode("focused")}>
                  ← back to guided review
                </button>
              </div>
              <ReviewView
                manifest={data.manifest}
                slug={slug}
                busy={busy}
                readOnly={data.readOnly}
                onAccept={(c) => decide(c, "accept")}
                onReject={(c, fb) => decide(c, "reject", fb)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { AuditEvent } from "../types.js";
import { fetchChunkHistory } from "../api.js";

/** Per-chunk revision + decision timeline, lazily loaded on first expand. */
export function HistoryPanel({ slug, stableId }: { slug: string; stableId: string }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChunkHistory(slug, stableId)
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e.message));
  }, [slug, stableId]);

  if (error) return <div className="history error">{error}</div>;
  if (!events) return <div className="history muted">Loading history…</div>;
  if (events.length === 0) return <div className="history muted">No history.</div>;

  return (
    <ul className="history">
      {events.map((e) => (
        <li key={e.id} className={`hist-${e.type}`}>
          <span className="hist-round">r{e.round}</span>
          {e.type === "revision" && <span>revised {e.supersedes ? "(supersedes prior)" : "(first version)"}</span>}
          {e.type === "decision" && (
            <span>
              {e.action === "accept" ? "✓ accepted" : "✗ rejected"}
              {e.feedback ? ` — "${e.feedback}"` : ""}
            </span>
          )}
          {e.type === "meta" && <span>{e.kind}</span>}
          <time>{new Date(e.ts).toLocaleString()}</time>
        </li>
      ))}
    </ul>
  );
}

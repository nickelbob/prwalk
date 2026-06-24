import { useMemo, useState } from "react";
import type { Manifest } from "../types.js";
import { LEVELS, riskLabel } from "../risk.js";
import { CollapsibleDescription } from "./CollapsibleDescription.js";

/**
 * Entry screen: the reviewer picks the risk level they want to review
 * one-at-a-time. Everything below the level is auto-accepted. Shows the live
 * split so the choice is informed.
 */
export function ReviewGate({
  manifest,
  busy,
  onStart,
}: {
  manifest: Manifest;
  busy: boolean;
  onStart: (level: number) => void;
}) {
  const live = useMemo(
    () => manifest.chunks.filter((c) => !c.absent),
    [manifest],
  );
  const dist = useMemo(() => {
    const d: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const c of live) d[c.risk] = (d[c.risk] ?? 0) + 1;
    return d;
  }, [live]);
  const maxBar = Math.max(1, ...Object.values(dist));

  const [level, setLevel] = useState<number>(manifest.pr.reviewLevel ?? 3);
  const inScope = live.filter((c) => c.risk >= level).length;
  const autoAccepted = live.length - inScope;

  return (
    <div className="gate">
      <h1>{manifest.pr.title || manifest.pr.branch}</h1>
      <div className="gate-meta">
        <code>{manifest.pr.branch}</code> ← <code>{manifest.pr.baseRef}</code> · round{" "}
        {manifest.pr.currentRound} · {live.length} chunks
      </div>
      <CollapsibleDescription text={manifest.pr.description} />

      <h2>How risky is each chunk?</h2>
      <div className="dist">
        {LEVELS.map((l) => (
          <div key={l} className={`dist-row ${l >= level ? "in" : "below"}`}>
            <span className={`risk risk-${l}`}>{l} · {riskLabel(l)}</span>
            <div className="dist-bar">
              <div className="dist-fill" style={{ width: `${(dist[l] / maxBar) * 100}%` }} />
            </div>
            <span className="dist-count">{dist[l]}</span>
          </div>
        ))}
      </div>

      <h2>What do you want to review?</h2>
      <div className="level-picker">
        {LEVELS.map((l) => (
          <button
            key={l}
            className={`level-btn ${level === l ? "selected" : ""}`}
            onClick={() => setLevel(l)}
          >
            {l}+
            <small>{riskLabel(l)} & up</small>
          </button>
        ))}
      </div>

      <p className="gate-summary">
        You'll review <strong>{inScope}</strong> chunk{inScope === 1 ? "" : "s"} one at a time.{" "}
        {autoAccepted > 0 ? (
          <>
            <strong>{autoAccepted}</strong> below level {level} will be auto-accepted (logged as
            not individually reviewed).
          </>
        ) : (
          <>Nothing is auto-accepted at this level.</>
        )}
      </p>

      <button className="btn accept start" disabled={busy} onClick={() => onStart(level)}>
        {busy ? "Starting…" : inScope > 0 ? `Start reviewing ${inScope} chunk${inScope === 1 ? "" : "s"}` : "Accept all & finish"}
      </button>
    </div>
  );
}
